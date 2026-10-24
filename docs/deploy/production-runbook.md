# Production runbook

Everything below matches `docker-compose.yml`, `Dockerfile` and `docker/entrypoint.sh`
as of the 2026-10-20 launch review (`docs/reviews/2026-10-20-launch-review.md`).
Written for a single-host Docker Compose deployment behind your own TLS proxy.

## 1. Environment switches

| Variable | Default | Effect |
|---|---|---|
| `ALLOWED_HOSTS` | none, required | Comma-separated hostnames. An empty value stops the backend at boot (`ImproperlyConfigured`). |
| `DB_CONN_MAX_AGE` | `60` | Seconds a worker keeps its Postgres connection open. `CONN_HEALTH_CHECKS` is always on. |
| `GUNICORN_WORKERS` | `3` | Sync workers per backend container. |
| `RUN_MIGRATIONS` | `1` | `1` runs `migrate` and the boot-time reconciliation (`sync_plugins`, `seed_plugin_permissions`, `grant_hbpr_plugin_access`, `purge_hbpr_archive`, `prune_notifications`, `purge_audit_logs --if-configured`, `sync_payroll_holidays`, `ensure_superuser`). `0` skips all of them. |
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
burst 40) and `/django-admin/login/`.

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
the ingress sends the header named by `INGRESS_REAL_IP_HEADER` (`CF-Connecting-IP`) and
its network is covered by `INGRESS_TRUSTED_CIDR`. Behind any other proxy that is not
configured, every user shares the proxy's address and one 20 r/s bucket, so
normal dashboard loads return 429. Before go-live, confirm with
`curl -s -H 'CF-Connecting-IP: 203.0.113.7' ...` (or your proxy's header) that
the backend logs the forwarded address, or set `INGRESS_REAL_IP_HEADER` and
`INGRESS_TRUSTED_CIDR` in `.env` and restart the `frontend` container.

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

## 5. Deploy, upgrade, rollback and operations

### 5.1 First deploy

Boot sequence of the backend container (`docker/entrypoint.sh`, all gated by
`RUN_MIGRATIONS=1`), in order:

1. `migrate --noinput`
2. `sync_plugins` (registers discovered plugins, never enables one)
3. `seed_plugin_permissions` (reconciles permission rows from each manifest)
4. `grant_hbpr_plugin_access`
5. `purge_hbpr_archive`
6. `prune_notifications` (read notifications older than 180 days)
7. `purge_audit_logs --if-configured` (no-op unless an admin set `retention_days`)
8. `sync_payroll_holidays` (copies Payroll-only holidays to HR and mirrors HR ones back; idempotent)
9. `ensure_superuser` (only when the `DJANGO_SUPERUSER_*` variables are set)
10. gunicorn

Steps 5 to 8 are non-fatal (`|| echo ... skipped`); a failure shows in `docker compose logs backend`.

The entrypoint runs `sync_payroll_holidays` only with `RUN_MIGRATIONS=1`. After enabling the Payroll plugin later, or on a dev box, run `py manage.py sync_payroll_holidays` by hand.

Steps:

1. Copy `.env.example` to `.env` and set the required values: `SECRET_KEY`,
   `ALLOWED_HOSTS`, `FRONTEND_URL`, `DB_PASSWORD`, `REDIS_PASSWORD`. Compose refuses to
   start without them. Optional: `DJANGO_SUPERUSER_USERNAME` / `_EMAIL` / `_PASSWORD`
   (first superuser), `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (Web Push; production reads
   them from the environment only), `EMAIL_*`, `ONLYOFFICE_*`, `INGRESS_*`, `DB_SSL_MODE`.
2. `docker compose up -d --build`. This builds both images, runs the boot sequence above
   (including `migrate`) and starts gunicorn.
3. Walk the ingress checklist (5.5) before sending users to the site.
4. `curl -f http://127.0.0.1:8080/api/health/ready/` returns 200.
5. Log in as the superuser, open Admin, Plugins, enable the plugins you want, then
   `docker compose restart backend`. Plugin URLs are computed once per process; an enabled
   plugin returns 404 until the restart.
6. Start the scheduled backup: `docker compose --profile backup up -d db-backup` (section 3).
7. Add the cron jobs in 5.4.

Static files: `collectstatic` is part of the image build (see `Dockerfile`), not of the boot sequence.

### 5.2 Upgrade

1. Take a database backup first (the section 3 loop, or one run: `docker compose --profile backup run --rm -e BACKUP_ONCE=1 db-backup`) and note the
   current commit with `git rev-parse HEAD`.
2. `git pull`.
3. `docker compose up -d --build`. The backend image reinstalls `requirements.txt` and
   `requirements-production.txt`. Outside Docker, run `pip install -r requirements.txt` in the
   venv that serves the app and restart it.
4. The entrypoint runs `migrate` and the reconciliation steps on start. With several replicas,
   migrate on one container only (see "Several backend replicas").
5. Check `docker compose logs backend | tail -n 50` for the boot lines and for `plugins.E001`.
   That system check stops startup when a plugin module fails to import (usually a package
   missing from the environment), so the app refuses to boot instead of silently dropping a plugin.
6. Probe `/api/health/ready/` and log in.

### 5.3 Rollback

Compose builds from source, so there is no registry tag to pin. To roll back code:

```bash
git checkout <previous-sha>
docker compose up -d --build
```

Migrations are not reversed automatically. If the failed release applied a migration that the
old code cannot run against, restore the database from the dump taken in 5.2 using section 4.1,
then start the old code with `RUN_MIGRATIONS=1`. If no migration was applied, a code rollback is enough.
For a fast local fallback, tag the images before an upgrade:
`docker tag <project>-backend:latest <project>-backend:pre-upgrade`.

### 5.4 Scheduled jobs (there is no task queue or scheduler)

The stack has no Celery or cron container. Boot commands run once per start. For a long-lived
replica, schedule these on the host with `docker compose exec -T backend python manage.py <command>`:

| Job | Command | Cadence | Notes |
|---|---|---|---|
| Notification retention | `prune_notifications` | daily | Deletes read notifications older than `--days` (default 180); unread are kept. Also runs at boot. |
| Audit log retention | `purge_audit_logs --if-configured` | daily | Deletes older than the plugin's `retention_days`; no-op until an admin sets it. Also runs at boot. |
| Analytics retention | `purge_analytics_data` | daily | Snapshots and metric points older than `data_retention_days` (default 365). Not run at boot, so it needs the cron. |
| HBPR assignment archive | `purge_hbpr_archive` | optional | Runs at boot and lazily on the staff-only assignments list. |
| Application backup | `create_site_backup` | weekly | Site Backup plugin archive (database fixture plus media). Separate from the `db-backup` loop. |
| Database and media dumps | `db-backup` profile | `BACKUP_INTERVAL_SECONDS` | Section 3. Copy offsite yourself. |

Analytics export files in `media/analytics_exports/` have no retention job yet (post-launch).

### 5.5 Ingress and real-client-IP checklist (before go-live)

From `docs/reviews/2026-10-15-perf-optimization-review.md`, M1. The `/api/` rate limit
(20 r/s, burst 40) and the login limit are keyed on the client address nginx sees.

1. The proxy terminates TLS and sends `X-Forwarded-Proto: https`.
2. The proxy sends the real client IP in the header named by `INGRESS_REAL_IP_HEADER`
   (default `CF-Connecting-IP`) and overwrites any client-supplied value.
3. `INGRESS_TRUSTED_CIDR` covers only the proxy's address (default `172.28.0.0/24`, the
   `frontend_net` subnet; the `/32` of the docker bridge gateway for a host proxy).
4. Confirm with a request carrying a test header (section 2) that the backend logs the
   forwarded address, then load the dashboard from two machines and check neither gets 429.
5. The frontend port stays bound to `127.0.0.1`. `NUM_PROXIES` stays `1`.

If the proxy is not trusted, every user shares one 20 r/s bucket and normal dashboard loads return 429.

### 5.6 Monitoring, logs and known gaps

- Logs: application logs go to stdout and stderr, so `docker compose logs -f backend` and
  `frontend` are the source. Use your host's Docker log driver if you need retention or shipping.
- Health: `/api/health/live/` (process up) and `/api/health/ready/` (database and cache reachable)
  need no authentication. Point the uptime monitor at `ready`.
- **No error monitoring or APM is installed.** Sentry would need a new dependency and a DSN, which
  is not approved (ruling D4 of the readiness plan: env-gated, post-launch). Until then, watch
  `docker compose logs backend` for tracebacks and keep the uptime probe on `ready`.
- No task queue: push fan-out runs after commit with a bounded timeout, while backup creation and
  large exports run inside the request (gunicorn timeout 120 s). Start large backups off-peak. A queue
  is post-launch work (readiness plan SR-01).
- Plugin URLs are loaded from the database at process start. If Postgres is unreachable when a worker
  first imports the URLconf, that worker serves no plugin routes (404) until it is recycled
  (`--max-requests 1000`) or the container restarts. Compose starts the database first (health-checked
  `depends_on`); restart the backend after any database outage that overlapped a boot.
- Contacts: add your organisation's on-call and escalation contacts here before go-live.
