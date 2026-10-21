#!/bin/sh
set -e

echo "[entrypoint] Waiting for postgres at $DB_HOST:$DB_PORT..."
python -c "
import socket, time, sys, os
host = os.environ.get('DB_HOST', 'db')
port = int(os.environ.get('DB_PORT', '5432'))
for attempt in range(60):
    try:
        s = socket.create_connection((host, port), timeout=2)
        s.close()
        print(f'[entrypoint] Postgres ready at {host}:{port}')
        sys.exit(0)
    except (OSError, ConnectionRefusedError):
        if attempt % 5 == 0:
            print(f'[entrypoint] Postgres not ready (attempt {attempt+1}/60)...')
        time.sleep(2)
print('[entrypoint] Postgres never became ready', file=sys.stderr)
sys.exit(1)
"

echo "[entrypoint] Waiting for redis..."
python -c "
import socket, time, sys, os
from urllib.parse import urlparse
url = os.environ.get('REDIS_URL', 'redis://redis:6379/0')
parsed = urlparse(url)
host = parsed.hostname or 'redis'
port = parsed.port or 6379
for attempt in range(60):
    try:
        s = socket.create_connection((host, port), timeout=2)
        s.close()
        print(f'[entrypoint] Redis ready at {host}:{port}')
        sys.exit(0)
    except (OSError, ConnectionRefusedError):
        if attempt % 5 == 0:
            print(f'[entrypoint] Redis not ready (attempt {attempt+1}/60)...')
        time.sleep(2)
print('[entrypoint] Redis never became ready', file=sys.stderr)
sys.exit(1)
"

export BUILD_ID="${BUILD_ID:-$(cat /app/.build_id 2>/dev/null || echo 1)}"

# DEP-06: schema migration and the boot-time reconciliation below write to the
# shared database and take no lock. With several replicas, set
# RUN_MIGRATIONS=0 on all but one container (or run them in a one-off job with
# RUN_MIGRATIONS=1 and start the replicas with RUN_MIGRATIONS=0). The default
# (1) keeps single-replica behaviour unchanged.
if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
    echo "[entrypoint] Running migrations..."
    python manage.py migrate --noinput

    # Register discovered plugins in the Plugin table (idempotent; never enables
    # anything). Without this a fresh deploy lists no plugins until an admin calls the
    # discover action. Enabling a plugin still needs a server restart afterwards,
    # because plugin URLs are computed once at process start.
    echo "[entrypoint] Syncing plugin registry..."
    python manage.py sync_plugins

    # Reconcile every plugin's permission rows from its manifest (creates missing rows,
    # always re-asserts manifest-owned role denials such as the HBPR block). sync_plugins
    # only registers plugins; without this, a fresh database has no permission rows until a
    # plugin is enabled, and an upgraded one keeps stale rows with no denial.
    echo "[entrypoint] Reconciling plugin permissions..."
    python manage.py seed_plugin_permissions

    # Existing databases keep their old PluginPermission rows, so reconcile the hbpr role's
    # view grants (tl_scorecard only) on every boot; an admin edit to them is re-asserted.
    echo "[entrypoint] Granting HBPR plugin access..."
    python manage.py grant_hbpr_plugin_access || echo "[entrypoint] HBPR grant skipped (non-fatal)"

    # Archive retention: ended HBPR assignments older than 6 months are deleted when
    # no governance evidence references them. No scheduler exists, so the sweep also
    # runs lazily on the staff-only admin list read; this reconciles on every boot.
    echo "[entrypoint] Purging HBPR assignment archive..."
    python manage.py purge_hbpr_archive || echo "[entrypoint] HBPR archive purge skipped (non-fatal)"

    # PERF-06 retention: read notifications older than 180 days are deleted (unread are
    # kept). No scheduler exists, so this runs on boot; for a long-lived replica also
    # run `python manage.py prune_notifications` from a daily cron.
    echo "[entrypoint] Pruning old read notifications..."
    python manage.py prune_notifications || echo "[entrypoint] Notification prune skipped (non-fatal)"

    # Audit-log retention: only when an admin explicitly set retention_days on the
    # audit_log plugin (--if-configured is a no-op otherwise, so no trail is ever
    # deleted by default). No scheduler exists; for a long-lived replica also cron it.
    echo "[entrypoint] Purging audit logs past the configured retention..."
    python manage.py purge_audit_logs --if-configured || echo "[entrypoint] Audit log purge skipped (non-fatal)"

    # Holidays defined only in Payroll work calendars are copied to HR (and HR ones
    # mirrored back). Idempotent; used to run in PayrollPlugin.ready() on every worker.
    echo "[entrypoint] Syncing HR and Payroll holidays..."
    python manage.py sync_payroll_holidays || echo "[entrypoint] Holiday sync skipped (non-fatal)"

    echo "[entrypoint] Ensuring superuser..."
    python manage.py ensure_superuser
else
    echo "[entrypoint] RUN_MIGRATIONS=${RUN_MIGRATIONS}: skipping migrations and boot-time reconciliation"
fi

echo "[entrypoint] Starting server..."
exec "$@"
