# Production runbook (skeleton)

Skeleton from Phase 4 of `docs/superpowers/plans/2026-10-14-production-readiness.md`.
Phase 9 expands it. Everything below matches `docker-compose.yml`, `Dockerfile`
and `docker/entrypoint.sh` as they are now.

## 1. Environment switches

| Variable | Default | Effect |
|---|---|---|
| `ALLOWED_HOSTS` | none, required | Comma-separated hostnames. An empty value stops the backend at boot (`ImproperlyConfigured`). |
| `DB_CONN_MAX_AGE` | `60` | Seconds a worker keeps its Postgres connection open. `CONN_HEALTH_CHECKS` is always on. |
| `GUNICORN_WORKERS` | `3` | Sync workers per backend container. |
| `RUN_MIGRATIONS` | `1` | `1` runs `migrate` and the boot-time reconciliation (`sync_plugins`, `seed_plugin_permissions`, `grant_hbpr_plugin_access`, `purge_hbpr_archive`, `ensure_superuser`). `0` skips all of them. |
| `BACKUP_INTERVAL_SECONDS` | `86400` | Pause between `db-backup` runs. |
| `BACKUP_RETENTION` | `7` | Newest N DB dumps and N media archives kept. |

### Connection budget

With sync workers each one holds one Postgres connection:
`replicas x GUNICORN_WORKERS` must stay below Postgres `max_connections`
(default 100). The backend container has a CPU limit of 1.0 and every worker
loads pandas, so adding workers adds memory and connections, not throughput.

### Several backend replicas

`migrate` and the boot commands take no lock. Run them on exactly one container:
start that one (or a one-off job) with `RUN_MIGRATIONS=1` and every other
replica with `RUN_MIGRATIONS=0`. Start the migrating container first; the others
assume the schema is current.

### Redis outage behaviour

The production cache uses `IGNORE_EXCEPTIONS` with 5 s socket timeouts. While
Redis is down the app keeps serving (cache misses) but DRF throttles, which live
in that cache, fail open. nginx still rate-limits `/api/` (20 r/s per client IP,
burst 40) and `/admin/login/`.

Cache invalidation fails open too: a `cache.delete` or version bump issued during
the outage is dropped, so cached permissions and `dashboard:*` entries written
before it can outlive a role revoke until their TTL after Redis returns. After
an outage that overlapped permission changes, flush the cache once Redis is
back (`python manage.py shell -c "from django.core.cache import cache; cache.clear()"`).

## 2. Ingress

The stack ships no TLS terminator or tunnel. An external reverse proxy (or a
Cloudflare Tunnel connector) must terminate TLS and forward to the `frontend`
service. See README.md, Production Deployment, Ingress, for the required
headers (`X-Forwarded-Proto`, real client IP) and the trusted subnet.

**Rate-limit key.** The `/api/` limit (20 r/s, burst 40) and the admin-login
limit are keyed on nginx's `$remote_addr`, which is the real client only when
the ingress sends the header named in `real_ip_header` (`CF-Connecting-IP`) and
its network is listed in `set_real_ip_from`. Behind any other proxy that is not
configured, every user shares the proxy's address and one 20 r/s bucket, so
normal dashboard loads return 429. Before go-live, confirm with
`curl -s -H 'CF-Connecting-IP: 203.0.113.7' ...` (or your proxy's header) that
the backend logs the forwarded address, or change `real_ip_header` and
`set_real_ip_from` in `frontend/docker/nginx.conf.template`.

## 3. Backups

`docker compose --profile backup up -d db-backup` starts a loop that writes, into
the `db_backup` volume:

- `engtracker_YYYY-MM-DD_HHMMSS.dump` (`pg_dump -Fc`)
- `media_YYYY-MM-DD_HHMMSS.tar.gz` (the `media_files` volume)

Files are written as `*.part` and renamed on success; old files are pruned only
after a successful write, so a failed run never reduces the number of good
backups. Check `docker compose logs db-backup` for `FAILED` lines.

The volume is on the same host as the database. Copy it to an encrypted offsite
location on a schedule you control; a host loss otherwise loses the backups too.

Application-level backups from the Site Backup plugin (superuser only) are a
separate mechanism and are not covered by this loop.

## 4. Restore

Stop writers first so nothing changes during the restore:

```bash
docker compose stop frontend backend
```

### 4.1 Database

```bash
# list backups
docker compose --profile backup run --rm --no-deps --entrypoint sh db-backup -c 'ls -1t /backups'

# restore into the running db service (drops and recreates objects)
docker compose --profile backup run --rm --entrypoint sh db-backup -c \
  'pg_restore --clean --if-exists --no-owner -d "$PGDATABASE" /backups/engtracker_YYYY-MM-DD_HHMMSS.dump'
```

Then start the backend with `RUN_MIGRATIONS=1` so migrations newer than the dump
are applied and plugin permissions are reconciled:

```bash
RUN_MIGRATIONS=1 docker compose up -d backend frontend
```

### 4.2 Media

The backup mounts `media_files` read-only, so restore through the backend image
or a throwaway container with the volume writable:

```bash
docker run --rm -v engineering-tracker_media_files:/media \
  -v engineering-tracker_db_backup:/backups:ro postgres:16 \
  sh -c 'tar -xzf /backups/media_YYYY-MM-DD_HHMMSS.tar.gz -C /media'
```

The volume names are prefixed with the compose project name (`engineering-tracker`).
Run `docker volume ls` to confirm. Files must stay readable by the backend user
(`appuser`); fix ownership with `chown -R` against that UID if the archive was
extracted as root.

### 4.3 Verify

1. `curl -f http://127.0.0.1:8080/api/health/ready/` returns 200.
2. Log in as an admin and open a page that lists records, then open an uploaded
   file from the Media-backed pages.
3. Check `docker compose logs backend` for tracebacks. Application logs go to
   stdout/stderr (`docker logs`).

## 5. To expand in Phase 9

Rollback procedure, secret rotation, upgrade steps, log shipping, alert
thresholds, and a rehearsed restore with timings.
