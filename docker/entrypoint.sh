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
url = os.environ.get('REDIS_URL', 'redis://redis:6379/0')
# Parse redis://host:port/db
host = 'redis'
port = 6379
if '://' in url:
    rest = url.split('://', 1)[1]
    if '/' in rest:
        rest = rest.split('/', 1)[0]
    if ':' in rest:
        host, port_s = rest.rsplit(':', 1)
        port = int(port_s)
    else:
        host = rest
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

echo "[entrypoint] Running migrations..."
python manage.py migrate --noinput

echo "[entrypoint] Starting server..."
exec "$@"
