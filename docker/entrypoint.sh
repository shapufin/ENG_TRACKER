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

# Existing databases keep their old PluginPermission rows, so the hbpr role needs a
# one-time view grant; the command is a no-op once hbpr has been configured.
echo "[entrypoint] Granting HBPR plugin access..."
python manage.py grant_hbpr_plugin_access || echo "[entrypoint] HBPR grant skipped (non-fatal)"

echo "[entrypoint] Ensuring superuser..."
python manage.py ensure_superuser

echo "[entrypoint] Starting server..."
exec "$@"
