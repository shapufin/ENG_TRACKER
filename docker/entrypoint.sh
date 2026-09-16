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

echo "[entrypoint] Ensuring superuser..."
python manage.py ensure_superuser

echo "[entrypoint] Starting server..."
exec "$@"
