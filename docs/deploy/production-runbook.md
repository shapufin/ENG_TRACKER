# Production runbook

Everything below matches `docker-compose.yml`, `Dockerfile` and `docker/entrypoint.sh`
as of the 2026-10-20 launch review (`docs/reviews/2026-10-20-launch-review.md`), plus the
2026-10-26 scheduler foundation (`scheduler` service, `export_files` / `snapshot_files`
volumes, nginx-served signed downloads).
Written for a single-host Docker Compose deployment behind your own TLS proxy.

## 1. Environment switches

| Variable | Default | Effect |
|---|---|---|
| `ALLOWED_HOSTS` | none, required | Comma-separated hostnames. An empty value stops the backend at boot (`ImproperlyConfigured`). |
| `DB_CONN_MAX_AGE` | `60` | Seconds a worker keeps its Postgres connection open. `CONN_HEALTH_CHECKS` is always on. |
| `GUNICORN_WORKERS` | `3` | Sync workers per backend container. |
| `RUN_MIGRATIONS` | `1` | `1` runs `migrate` and the boot-time reconciliation (`sync_plugins`, `seed_plugin_permissions`, `grant_hbpr_plugin_access`, `purge_hbpr_archive`, `prune_notifications`, `purge_audit_logs --if-configured`, `flushexpiredtokens`, `sync_payroll_holidays`, `ensure_superuser`). `0` skips all of them. |
| `BACKUP_INTERVAL_SECONDS` | `86400` | Pause between `db-backup` runs. |
| `BACKUP_RETENTION` | `7` | Newest N DB dumps and N media archives kept. |
| `EXPORT_ROOT` | `/app/exports` | Volume for generated ZIP exports. Transient (24 h), regenerable, **never backed up**, outside `MEDIA_ROOT` so Site Backup cannot zip it and `/media/` cannot serve it. |
| `SNAPSHOT_ROOT` | `/app/snapshots` | Volume for year-close snapshots. Durable evidence: `db-backup` archives it as `snapshots_*.tar.gz`. Also outside `MEDIA_ROOT`. |
| `EXPORT_JOBS_INLINE` | `False` in production, `True` in dev | Build an export synchronously at request time instead of queueing it for the scheduler. Never enable in production: gunicorn would stream the ZIP. |

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
- `snapshots_YYYY-MM-DD_HHMMSS.tar.gz` (the `snapshot_files` volume — year-close evidence)

`export_files` is deliberately **not** archived: exports are transient (24 h) and
can be regenerated from the live data, so backing them up would only duplicate the
database into the backup set.

Files are written as `*.part` and renamed on success; old files are pruned only
after a successful write, so a failed run never reduces the number of good
backups. Check `docker compose logs db-backup` for `FAILED` lines.

The volume is on the same host as the database. Copy it to an encrypted offsite
location on a schedule you control; a host loss otherwise loses the backups too.

Application-level backups from the Site Backup plugin (superuser only) are a
separate mechanism and are not covered by this loop. Those archives are encrypted
at rest with `BACKUP_ENCRYPTION_KEYS` (required in production; generate it like
`MFA_ENCRYPTION_KEYS` and keep it with `SECRET_KEY`, never in the `db_backup`
volume). The `*.dump` and tar files above are **not** encrypted by the application:
encrypt the volume at the host or copy it to encrypted offsite storage, and check
the volume's permissions so only the backup user can read it.

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

### 4.3 Snapshots (year-close evidence)

Restore the snapshot volume the same way as media, into `snapshot_files`:

```bash
docker run --rm -v engineering-tracker_snapshot_files:/snapshots \
  -v engineering-tracker_db_backup:/backups:ro postgres:16 \
  sh -c 'tar -xzf /backups/snapshots_YYYY-MM-DD_HHMMSS.tar.gz -C /snapshots'
```

The `YearSnapshotFile` rows come back with the database dump; the files and the
rows must be restored from the **same** backup run, or the checksums in each
`MANIFEST.json` stop matching. Ownership: uid 10001, like media.

### 4.4 Verify

1. `curl -f http://127.0.0.1:8080/api/health/ready/` returns 200.
2. Log in as an admin and open a page that lists records, then open an uploaded
   file from the Media-backed pages.
3. Check `docker compose logs backend` for tracebacks. Application logs go to
   stdout/stderr (`docker logs`).
4. `docker compose ps scheduler` is `healthy` (its healthcheck reads the heartbeat
   file, so an unhealthy scheduler means jobs are not running).

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
   `ALLOWED_HOSTS`, `FRONTEND_URL`, `DB_PASSWORD`, `REDIS_PASSWORD`, `MFA_ENCRYPTION_KEYS`
   (generate one with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`;
   read "Two-factor keys" in section 5.7 before you change or lose it). Compose refuses to
   start without them. Optional: `DJANGO_SUPERUSER_USERNAME` / `_EMAIL` / `_PASSWORD`
   (first superuser), `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (Web Push; production reads
   them from the environment only), `EMAIL_*`, `ONLYOFFICE_*`, `INGRESS_*`, `DB_SSL_MODE`.
2. `docker compose up -d --build`. This builds both images, runs the boot sequence above
   (including `migrate`) and starts gunicorn, the `scheduler` and the frontend. The scheduler
   is not optional: onboarding exports and (later) year close are queued as database rows and
   only the scheduler builds them, so without it a Download ZIP stays `pending` forever.
3. Walk the ingress checklist (5.5) before sending users to the site.
4. `curl -f http://127.0.0.1:8080/api/health/ready/` returns 200.
5. Log in as the superuser, open Admin, Plugins, enable the plugins you want, then
   `docker compose restart backend`. Plugin URLs are computed once per process; an enabled
   plugin returns 404 until the restart.
6. Confirm the generated-file volumes exist and are writable by the app user:
   `docker compose exec backend sh -c 'touch /app/exports/.probe /app/snapshots/.probe && rm /app/exports/.probe /app/snapshots/.probe'`.
   nginx mounts them read-only at `/_protected/exports/` and `/_protected/snapshots/`; a
   permission problem shows up as a 404 from nginx, not as a backend error.
7. Start the scheduled backup: `docker compose --profile backup up -d db-backup` (section 3).
8. Add the host cron jobs that the scheduler does **not** cover (section 5.4).

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

### 5.2.1 Maintenance mode (close the site before an upgrade)

Turn it on **before** an upgrade that changes data or needs the app to be quiet, and off
afterwards. Admin panel → Global Settings → **Maintenance** tab.

What happens while it is on:

- Every non-admin is locked out immediately: sign-in, token refresh, reads and writes all
  answer `503` with `{"code": "maintenance"}`. Staff (`is_staff`) and superusers keep working,
  so the admin panel and Django admin stay usable. Role-only CR admins are **not** staff and
  are locked out.
- Everyone else sees the maintenance screen. It reloads into the app by itself when the
  switch is turned off (the SPA polls every 30 s).
- Set an **expected end** as a safety net: the window expires by itself at that time, so a
  forgotten switch cannot lock the team out indefinitely. Leave it empty only if you are
  actively watching.
- `/api/health/live/` and `/api/health/ready/` keep answering, so Docker/orchestrator health
  checks do not restart containers during the window.
- The `scheduler` service is not affected: due plugin jobs still run (and write) during
  maintenance. If a job must not run, disable the plugin or stop the scheduler first.

The switch is stored in the `dashboard_maintenance_state` singleton and cached for up to 60 s
per worker; every write clears that cache, so turning it on/off is instant. Every switch change
is written to the audit log as `MAINTENANCE_ON` / `MAINTENANCE_OFF`, and every refused sign-in
during a window is logged as `MAINTENANCE_BLOCKED` — never `LOGIN_FAILED`, so a window of
refusals cannot be mistaken for a brute-force burst. Editing the headline/message of an active
window is not audited.

Open backlog for this feature (tracked): `docs/backlog.md`.

Break-glass if the admin GUI is unreachable:

```bash
docker compose exec backend python manage.py shell -c \
  "from apps.dashboard.models import MaintenanceState as M; \
   s,_=M.objects.get_or_create(pk=1); s.is_active=False; s.ends_at=None; s.started_at=None; s.save()"
```


### 5.4 Scheduled jobs (scheduler service; host cron for one-offs)

The `scheduler` service runs `manage.py run_scheduler`: one long-lived process, no Celery and
no host cron needed for plugin jobs. It ticks every 5 s, asks every **enabled** plugin for its
`get_scheduled_jobs()` list, and runs whatever is due. A failing job is logged and does not
stop the others. It never migrates (`RUN_MIGRATIONS=0`); watch it with
`docker compose logs -f scheduler`.

It writes a heartbeat file; the container's healthcheck reads that file, so `docker compose ps
scheduler` showing `unhealthy` means jobs are not running. If the scheduler is down, queued
exports stay `pending` — the UI shows "queued longer than 2 minutes, check the scheduler".

Jobs it owns (the table is the output of every plugin's `get_scheduled_jobs()` plus `CORE_JOBS`; a daily retention job also runs once at boot from `docker/entrypoint.sh`, so no host cron is required):

| Job | Plugin | Interval | Notes |
|---|---|---|---|
| `process_client_exports` | onboarding | 10 s | Builds requested ZIPs. `EXPORT_JOBS_INLINE=True` (dev/test only) bypasses it. |
| `cleanup_exports` | onboarding | hourly | Deletes expired (24 h) export files and rows. |
| `reports` | analytics | hourly | Sends every due scheduled analytics report once (`plugins/analytics/scheduled_reports.py`); needs the `scheduler` service and working SMTP. Manual: `manage.py run_scheduled_reports`. |
| `purge` | analytics | daily | Deletes analytics snapshots and metrics past retention (`purge_analytics_data`). |
| `housekeeping` | notifications | daily | Deletes read notifications older than 180 days and old idempotency records. |
| `purge` | audit_log | daily | `purge_audit_logs --if-configured`: a no-op unless an admin set `retention_days`. |
| `flush_expired_tokens` | core | daily | Deletes expired refresh-token rows; runs whichever plugins are enabled. |
| `lifecycle` | payroll | hourly | Month-end draft, urgent reminders, early and cutoff finalize. |
| `year_start` | payroll | daily | From 1 November, a weekly notice to HR and administrators while next year lacks holidays, a work calendar or a rule set. |
| `freeze_scorecard_months` | tl_scorecard | hourly | Freezes finished scorecard months. |
| `cadence_reminders` | tl_scorecard | hourly | HBPR cadence reminders. |
| `one_on_one_reminders` | tl_scorecard | hourly | Recurring 1-on-1 reminders. |
| `close_year` | year_close | hourly | Builds the year-close snapshot when last year is eligible. |
| `retention_notices` | year_close | daily | Notices only; a purge is never scheduled. |

Boot commands still run once per start. For anything the scheduler does not cover, use host
cron with `docker compose exec -T backend python manage.py <command>`:

| Job | Command | Cadence | Notes |
|---|---|---|---|
| Notification retention | `prune_notifications` | daily | Deletes read notifications older than `--days` (default 180); unread are kept. Also runs at boot. |
| Audit log retention | `purge_audit_logs --if-configured` | daily | Deletes older than the plugin's `retention_days`; no-op until an admin sets it. Also runs at boot. |
| Expired refresh tokens | `flushexpiredtokens` | daily | simplejwt's own command: deletes expired `OutstandingToken` rows (every login and refresh adds one, nothing else removes them). Also runs at boot. |
| Monthly audit archive | `rotate_audit_logs` | monthly (1st of month) | Compresses full previous month into `media/audit_archives/audit_logs_YYYY_MM.json.gz` and prunes database. UI button also available in `/admin/audit-logs`. |
| Month cutoff auto-finalize | `auto_finalize_approval_periods [--period YYYY-MM-DD]` | hourly (payroll plugin scheduler job `payroll.lifecycle`, which also creates the month-end draft, sends urgent reminders and finalizes payroll early or at the cutoff: workflow-invariants item 59; needs `run_scheduler` running) | A no-op until 00:00 on the cutoff day (the 5th of the next month, moved to the next working day, Europe/Tirane); then closes the previous month for every user no Line Manager or Manager closed, so payroll finalize is never blocked. Idempotent. Run by hand to close a month ahead of the job. |
| Cancelled payroll run leftovers (one time) | `purge_cancelled_run_leftovers` | once after deploying 2026-11-04 | Deletes lines and draft entries kept by runs cancelled before `cancel_run` cleaned up after itself. Idempotent; nothing to schedule. |
| Analytics retention | `purge_analytics_data` | daily | Snapshots and metric points older than `data_retention_days` (default 365). Not run at boot, so it needs the cron. |
| Engagement freeze backfill | `finalize_frozen_metrics` | once after deploying the metrics freeze (optional daily) | Gives every snapshot past its freeze one final recompute; idempotent. Reads do it lazily, this is the bulk path. `docs/team-lifecycle.md` section 4. |
| Scorecard month freeze | scheduler job `freeze_scorecard_months` | hourly (scheduler service) | Snapshots each TL's month blocks once the month is past the freeze; no-op when done. Needs the `scheduler` service; one-off: `manage.py freeze_scorecard_months [--month YYYY-MM-01]`. |
| Archived data notice and purge | scheduler job `retention_notices` (daily, notices only) and `purge_expired_years` (manual: dry run first, `--apply --confirm PURGE-ARCHIVED-YEARS`) | notices daily, purge by a superuser | Notices go to superusers 90 and 30 days before a closed year's removal date (3 years; payroll 5). A purge removes database rows of one archived category after the gates in `docs/workflow-invariants.md` item 77 pass; the archive ZIP then becomes the only copy, so back up `SNAPSHOT_ROOT` first. Also available as the Archives page button. |
| Archived team purge | `purge_archived_teams` | monthly (try `--dry-run` first) | Purges teams archived 365+ days with nothing depending on them and a closed archive year, plus detached calendar workspaces older than 365 days. Opt-in, not run at boot. `docs/team-lifecycle.md`. |
| HBPR assignment archive | `purge_hbpr_archive` | optional | Runs at boot and lazily on the staff-only assignments list. |
| Application backup | `create_site_backup` | weekly | Site Backup plugin archive (database fixture plus media). Separate from the `db-backup` loop; restore headlessly with `restore_site_backup` (`docs/site-backup-and-restore.md`). |
| Database, media and snapshot dumps | `db-backup` profile | `BACKUP_INTERVAL_SECONDS` | Section 3. Copy offsite yourself. |

**Hung jobs.** The scheduler records the job it is running. If one run lasts longer than `SCHEDULER_JOB_TIMEOUT` seconds (default 1800; raise it only for a legitimately longer export) the heartbeat thread stops and the process exits, so the compose healthcheck goes red and `restart: unless-stopped` restarts it; the log line is `Scheduled job <name> is stuck past its limit`. Production also sets `EMAIL_TIMEOUT` (30 s), `DB_CONNECT_TIMEOUT` (10 s) and `DB_LOCK_TIMEOUT_MS` (30000) so a dead SMTP socket or a lock wait fails the job instead of hanging it. `PUSH_ENDPOINT_EXTRA_HOSTS` (comma-separated hostnames, empty by default) allows an extra Web Push host beyond the built-in browser services.

A one-off run of a plugin job (for a retry) is
`docker compose exec -T scheduler python manage.py run_scheduler --once`.

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
- Scheduler: `docker compose ps scheduler` must stay `healthy` — its healthcheck fails when the
  heartbeat file stops advancing (120 s), which is the only signal that queued exports have
  stopped being built. Alert on it: a dead scheduler looks like "nothing happens" rather than
  an error.
- **No error monitoring or APM is installed.** Sentry would need a new dependency and a DSN, which
  is not approved (ruling D4 of the readiness plan: env-gated, post-launch). Until then, watch
  `docker compose logs backend` for tracebacks and keep the uptime probe on `ready`.
- No task queue: push fan-out runs after commit with a bounded timeout. Export ZIPs are built by
  the scheduler, not in the request, and are downloaded through nginx (`/_protected/`) so gunicorn
  never streams them. Site Backup creation still runs inside the request (gunicorn timeout 120 s),
  so start large backups off-peak. A real queue is post-launch work (readiness plan SR-01).
- Plugin URLs are loaded from the database at process start. If Postgres is unreachable when a worker
  first imports the URLconf, that worker serves no plugin routes (404) until it is recycled
  (`--max-requests 1000`) or the container restarts. Compose starts the database first (health-checked
  `depends_on`); restart the backend after any database outage that overlapped a boot.
- Contacts: add your organisation's on-call and escalation contacts here before go-live.

### 5.7 Two-factor keys, moves and break-glass

Two-factor (TOTP) is optional per person until an admin switches on the company-wide requirement
(Admin, Global Settings) or ticks "Require two-factor" on a user. Enrolled users are always asked for a code.

- **`MFA_ENCRYPTION_KEYS`** encrypts every TOTP seed in the database. It is a comma-separated list:
  the first key encrypts, every key decrypts. Keep it in the same password manager entry as
  `SECRET_KEY`, **never** in the `db-backup` volume or next to a database dump (that would defeat the
  encryption). The Site Backup plugin deliberately leaves the two-factor tables out of its archives.
- **Moving to a new server**: restore the database with `pg_restore` (section 4.1), put the *same*
  `MFA_ENCRYPTION_KEYS` in the new `.env`, start the stack. The boot log must say
  `All N MFA seeds are readable.` If it says `WARNING: MFA seeds are unreadable`, stop: the key does
  not match. Enrolled users cannot sign in (it fails closed, they see "unavailable"), nobody is let in
  password-only. Fix the key, or run `reset_user_mfa` per user and have them enrol again.
- **Before routing traffic to a new host**, make sure its clock is NTP-synced (`timedatectl status`);
  TOTP codes are time based and a host a minute off rejects honest codes. The container timezone does
  not matter.
- **Rotating the key**: prepend the new key (`NEW,OLD`), deploy, run
  `docker compose exec backend python manage.py check_mfa_key --reencrypt`, then remove `OLD` and deploy.
- **Locked-out user (lost phone and backup codes)**: an admin uses "Reset two-factor" on the user, or from
  the server: `docker compose exec backend python manage.py reset_user_mfa <username>`. This ends the
  user's sessions; if MFA is required for them they enrol again at the next sign-in.
- **Rollback hazard**: rolling the code back to a release that predates two-factor makes the old login
  ignore it, so enrolled users silently sign in with the password only. Accept that knowingly, or ask
  users to wait, before rolling back past this feature.
- Turning the company-wide requirement on never locks anyone out: a user without a factor is walked
  through setup at sign-in, and only then receives a session. The window between switching it on and a
  person finishing setup is the one moment a stolen password alone is enough for that person's account.

### 5.8 Passkeys (WebAuthn)

A passkey (Face ID, fingerprint or device PIN) is an alternative second factor beside the authenticator
app: it never replaces it, and TOTP plus backup codes stay the fallback. Spec:
`docs/superpowers/specs/2026-11-18-passkeys-design.md`.

- **Settings** (`.env`, passed through `docker-compose.yml`): `WEBAUTHN_RP_ID=tracker2.integrit.org` (exact host,
  not the parent domain), `WEBAUTHN_ORIGINS=https://tracker2.integrit.org`, optional `WEBAUTHN_RP_NAME`.
  Unset leaves passkeys off and nothing else changes. Set to a wrong value (an `http` origin, an RP ID that is
  not a suffix of the origin host, only one of the two) the backend refuses to boot.
- **Check after any hostname, proxy or TLS change**:
  `docker compose exec backend python manage.py check_webauthn_config --production`. It prints the RP ID,
  origins and how many passkeys are registered, and exits non-zero when the setup is invalid.
- **The RP ID is bound to every passkey for life.** Moving the site to another hostname makes every passkey
  unusable: users sign in with the authenticator app or a backup code and add their passkey again. Passkey-only
  users cannot, so they need `reset_user_mfa`. Decide the hostname before rolling passkeys out widely.
- **Moving to a new server**: the credentials are in the database (`users_webauthn_credential`) and travel
  with `pg_dump`. There is no key to carry, but the hostname must stay the same. The Site Backup archive leaves
  both passkey tables out on purpose.
- **Locked-out user**: `reset_user_mfa <username>` (or "Reset two-factor" in the admin panel) removes the app,
  backup codes and every passkey and ends the user's sessions.
- **`/django-admin/` login** still asks for an authenticator code. A staff user whose only factor is a
  passkey is refused there (it fails closed): give them the authenticator app as well.
- **Watch the audit log** for `MFA_PASSKEY_CLONE_SUSPECTED` (a passkey reported a lower sign counter, which
  can mean a cloned authenticator) and repeated `MFA_FAILED` rows with reason `verification_failed`.
- Challenges expire after 120 s and are deleted lazily when the next one is created; there is no job to run.

## Year-start checklist (audit 2026-11-16 M4)

Do this in November or December, before people book leave for the new year:

1. `python manage.py check_year_start --year <next year>`: read-only; exits non-zero and names what is missing (global public holidays, an active payroll work calendar that marks every holiday, a rule set effective on 1 January).
2. Add the holidays in HR > Holidays. A holiday added, moved or deleted later recounts open future vacation and its balances automatically; `python manage.py recount_leave_days --from <date> --to <date>` (dry run, add `--apply`) repairs a past change.
3. Create the work calendar for the year and use *Generate* only after step 2: generation is refused (400) while the year has no holidays, it never invents them; `python manage.py sync_payroll_holidays` mirrors HR holidays into it. Payroll refuses a draft whose month has a holiday the calendar does not mark.
4. Leave carry-over rolls over on the first leave read of the year; the year close and its retention notices run from the scheduler.

## Year-close checklist (audit 2026-11-17, workflow-invariants item 88)

A year closes by itself from 1 February of the next year (scheduler job `year_close.close_year`, hourly). Superusers get a "Closing YYYY needs attention" notice (Archives page link) whenever it is blocked or a file failed, once per set of reasons.

1. Clear the blockers the notice and the Archives page list: pending overtime, standby or leave; draft payroll runs; approved entries of payroll subjects that are in no finalized run; a current leader without a December scorecard snapshot (`python manage.py freeze_scorecard_months`). Approved entries of Managers, superusers, deactivated people or people without a wage are a warning, never a blocker.
2. After it closes, download and verify the files on the Archives page. `python manage.py close_year --year <year>` shows the same state from the shell.
3. To correct a closed year: `python manage.py reopen_year --year <year> --reason "..."`, fix the rows, then wait for the next hourly run (or run `close_year --year <year>`). The old set is superseded and a new version is built and frozen. Then a superuser must open the Archives page, check the rebuilt files and press *Confirm rebuilt archive*: nothing of that year can be removed before that.
4. Removal (retention) is always a superuser action. It is refused while the archive counts differ from the database, while a rebuilt set is unconfirmed, and, for overtime and standby, while finalized payroll still points at them (they go with or after the payroll, from year + 5).
5. Restoring a database from before a close: the archive volume keeps the old set; the next run rebuilds it from the restored data and step 3's confirmation applies.

## Logs and dependency lock (audit 2026-11-16 L1, L9)

- Logs: the backend writes only to stdout/stderr with a time, level and logger name on every line; read them with `docker compose logs`. There are no log files and no `logs/` volume to mount.
- Locked dependencies (not done yet): `requirements.txt` pins direct packages only. To produce a hashed lock for the production image, run this inside the production Python 3.12 Linux image (a Windows or 3.14 environment resolves different wheels):

      pip install pip-tools
      pip-compile --generate-hashes -o requirements.lock requirements.txt requirements-production.txt

  Commit `requirements.lock`, then change the Dockerfile to `pip install --require-hashes -r requirements.lock` and rebuild in CI before deploying. Do not switch the Dockerfile before the lock exists.


### 5.9 Phone approval sign-in (push and QR)

A paired phone approves a login: the PC shows a number, the phone gets a notification (or scans a QR code),
the user taps the same number and confirms with a fingerprint or face. It is one more second factor beside
the authenticator app and passkeys (workflow-invariants item 90, spec
`docs/superpowers/specs/2026-11-19-phone-approval-login-design.md`).

- **Switch**: `PHONE_APPROVAL_ENABLED=true` in `.env` (passed through `docker-compose.yml`). Unset or false it
  is off: every phone endpoint answers 404 and the sign-in flow is exactly as before. Enabled without
  `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGINS` the backend refuses to boot (an approval is a passkey assertion).
- **Rollout order**: (1) passkeys already work (5.8, `check_webauthn_config --production`); (2) `VAPID_PUBLIC_KEY`
  and `VAPID_PRIVATE_KEY` are set (push); (3) set the switch and restart the backend; (4) on one phone open
  Settings, Security, "Set up this phone"; (5) sign in on a computer and approve with the notification, then
  again with "Show QR code instead"; (6) tell users. **Android**: Chrome needs no install. **iPhone**: push needs
  the app added to the Home Screen (iOS 16.4 or later); otherwise the QR code is the path.
- **Approval link host**: the link in the notification and the QR code uses the first entry of `WEBAUTHN_ORIGINS`;
  it must be the host users open the app on (the service worker only opens same-origin links).
- **Rollback**: set the switch to false and restart. No migration to revert; paired phones stay in the
  database and work again when the switch returns.
- **Locked-out or lost phone**: the user removes the phone under Settings (needs the password), or an admin
  runs `reset_user_mfa <username>`, which also removes every pairing and live request and ends the sessions.
- **Throttle**: the PC polls `api/auth/token/phone-collect/` every 2 s under its own scope `phone_poll`
  (240/min per IP); the other endpoints share `mfa` (10/min). Raise `phone_poll` only if an office behind one
  address sees 429 while waiting.
- **Watch the audit log** for `MFA_PHONE_WRONG_NUMBER` (someone approving blind, or an attacker who knows the
  password), repeated `MFA_FAILED` rows from `phone` approvals, and `MFA_LOCKED`.
- **Moving to a new server**: pairings are in the database (`users_paired_phone`) and travel with `pg_dump`.
  The Site Backup archive leaves both phone tables out on purpose. The hostname (RP ID) and the `VAPID_*` keys
  must stay, or push stops working and the QR code is the only path.
- **Requests** live 120 s and are deleted lazily when the next one is created; there is no job to run.
