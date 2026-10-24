# Engineering Time Tracker

A comprehensive time tracking and management system for engineering teams, built with Django 6.1 and React 19.

---

## Using the app

Sign in with the username and password your administrator gave you. What you see depends on your role.

| Role | What you can do |
|------|-----------------|
| **Employee** | Log overtime and standby, request leave, see your own balances and records (**My records**), and see when teammates are away on the **Calendar**. You never see teammates' request statuses. |
| **Team leader** | Everything an employee can, plus **Pending Approvals** (`/team/approvals`): approve or reject your team's overtime, standby and leave one by one or in bulk, and finalize a month. |
| **HR** | Company-wide holidays, leave and reports, and payroll (view, manage, export). |
| **HBPR** | Read-only governance view of the Albanian team leaders assigned to you (`/hbpr`). |
| **Admin** | The admin panel: users, teams, clients, logs, reports, plugins and system settings. |

**Everyday tasks**
- **Log overtime or standby:** open *Overtime* or *Standby*, choose **Add Entry**, then submit. Use the date filter for other months and the **Status** chips to show only pending, approved or rejected entries.
- **Request leave:** open *Leave* and create a request. Vacation days count Monday to Friday, minus public holidays.
- **Edit or delete an entry:** use the row actions. Entries from past months are locked for employees; ask your team leader or an administrator.
- **Notifications:** the bell shows in-app notifications. Turn on push in *Settings, Notification Preferences*.

**Install it like an app.** Desktop Chrome or Edge: use the install icon in the address bar. Android Chrome: menu, *Install app*. iPhone or iPad: Safari, Share, *Add to Home Screen*, then open the installed app (push needs it). The app loads offline, but data needs a connection. Your own recent reads are cached with a "stale" marker, and a personal entry you create offline is sent when you are back online. Details are under *Progressive Web App* below.

**Trouble signing in or seeing a page?** A missing page usually means your role does not include it. Ask your administrator; do not share accounts.

---

## AI-assisted development

Agents working in this repository follow [`CLAUDE.md`](CLAUDE.md) (task router, hot
invariants, verification commands) and the tracked
[`docs/workflow-invariants.md`](docs/workflow-invariants.md). The `.devin/` directory is
local-only (gitignored), so links into it are aids that may be absent on other clones.

---

## 📊 Project Status & Health

### Latest review

The pre-production launch review (findings register, triage of deferred items, baseline
results) is in [`docs/reviews/2026-10-20-launch-review.md`](docs/reviews/2026-10-20-launch-review.md).
The earlier readiness programme is in
[`docs/superpowers/plans/2026-10-14-production-readiness.md`](docs/superpowers/plans/2026-10-14-production-readiness.md).

### Quick Health Check
Run these commands to verify system integrity:

**Backend (Python 3.12+):**
```bash
py -3.14 manage.py check      # Windows dev; use python 3.12+ elsewhere
py -3.14 manage.py test
```

**Frontend (Node 20+):**
```bash
cd frontend
npm run lint
npx tsc -b
```

---

## Documentation

Tracked documentation lives in `docs/`; `.devin/` (AI context) is local-only and may be absent.

| Document | Description |
|----------|-------------|
| [CLAUDE.md](CLAUDE.md) | Task router, hot invariants, verification commands |
| [docs/workflow-invariants.md](docs/workflow-invariants.md) | Shared invariants and recipes (leave, payroll, timezone, retention, E2E) |
| [docs/deploy/production-runbook.md](docs/deploy/production-runbook.md) | First deploy, upgrade, rollback, backups, scheduled jobs, ingress checklist |
| [docs/hbpr-and-scorecard.md](docs/hbpr-and-scorecard.md) | HBPR role and TL scorecard rules |
| [docs/engagement-metrics.md](docs/engagement-metrics.md) | TL engagement SLA rules |
| [docs/table-header-contract.md](docs/table-header-contract.md) | Table header rule and audit gate |
| [docs/ui-control-kit.md](docs/ui-control-kit.md) | Control kit and surface rules |
| [docs/superpowers/plans/2026-10-22-user-frontend-audit.md](docs/superpowers/plans/2026-10-22-user-frontend-audit.md) | User-facing frontend audit: findings, fixes, backlog |
| [docs/reviews/2026-10-20-launch-review.md](docs/reviews/2026-10-20-launch-review.md) | Launch review register and go/no-go |

## Features

- **User Management**: Role-based access control (Employee, Team Leader, HR, HBPR — HR business partner for Italy, see `docs/hbpr-and-scorecard.md`)
- **Overtime Tracking**: Log and approve overtime hours with client/project details
- **Standby Management**: Track on-call and standby hours
- **Vacation Management**: Holiday requests with calendar view and balance tracking
- **Dashboard**: Role-based dashboards with statistics and summaries
- **Admin Panel**: Dashboard for comprehensive data management and system configuration
- **Tree-View Teams**: Hierarchical team management with automated member synchronization
- **Reports**: Advanced report generation with animated statistics and multi-format export

### Plugins

Optional features live in `plugins/` and start disabled after a fresh deploy (enable them in Admin, Plugins, then restart the backend):
`analytics`, `audit_log`, `control_room`, `data_import`, `engagement`, `notifications`, `onboarding`, `organigrama`, `payroll`, `site_backup`, `skills`, `ticket_kpi`, `tl_scorecard`.

## Progressive Web App (PWA)

The Engineering Tracker is installable as a PWA on desktop and mobile
browsers. The readiness plan lives in `.devin/plans/` (local-only, may be absent).

### Browser support

| Browser | Install | Push | Offline shell |
|---------|---------|------|----------------|
| Desktop Chrome / Edge | Yes | Yes | Yes |
| Android Chrome | Yes | Yes | Yes |
| iOS Safari (installed) | Yes | Yes (16.4+) | Yes |
| iOS Safari (browser tab) | No | No | No |

### Installing

- **Desktop Chrome/Edge**: click the install icon in the address bar.
- **Android Chrome**: menu → *Install app* / *Add to Home screen*.
- **iOS Safari**: Share → *Add to Home Screen*. Open the installed app
  to enable push notifications (iOS requires standalone mode for push).

### Offline behavior

The app is **online-first**. The service worker caches the app shell
(HTML/CSS/JS) so the UI loads offline, but API data requires a network
connection. Limited personal reads (own leave balances, own overtime
logs) are cached for offline viewing with stale markers. Personal
idempotent mutations (e.g. creating a standby log) are queued and
flushed when connectivity returns. Admin, team, and permission
mutations are never queued or cached.

### Push notifications

Push is best-effort; in-app notifications remain the source of truth.
To enable push, grant notification permission in Settings →
Notification Preferences. On iOS, the app must be installed first. If
push is blocked, the Settings page shows a recovery message directing
you to browser settings.

### E2E verification

PWA behavior is verified against a production build (not the dev
server) using `npm run test:e2e:pwa`. This covers manifest, service
worker registration, offline app-shell reload, SPA deep-link fallback,
and push/click handler safety.

Role-by-role browser/API verification (every role, every plugin route, leave,
overtime, payroll PDFs, theme checks) lives in `frontend/e2e/role-workflows.spec.ts`.
It must run against an isolated database with the 3.14 interpreter and a
pre-prepared plugin registry; the exact steps and the known pre-existing failures
are in `docs/superpowers/UPGRADE-JOURNAL.md` ("Role-workflow simulation").

## Tech Stack

### Backend
- Django 6.1 (Python 3.12+)
- Django REST Framework (DRF)
- JWT Authentication (SimpleJWT) with startup validation
- PostgreSQL (Production) / SQLite (Dev)
- Redis Caching

### Frontend
- React 19 (Dark-first design)
- TypeScript 7 (Strict mode)
- Tailwind CSS 4 with semantic tokens
- TanStack Table v9 (one shared feature set and `AppColumnDef` types, `components/ui/tableTypes.ts`)
- shadcn/ui + Lucide icons
- TanStack Query (v5)
- React Router v7

## Quick Start

### Prerequisites
- Python 3.12+
- Node.js 20+
- PostgreSQL (for production)

### Backend Setup

```bash
# Create virtual environment
python -m venv venv
venv\Scripts\activate  # Windows
source venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Start server
python manage.py runserver
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev

# Run tests
npm test
```

## Production Deployment

The app ships as a multi-container Docker stack (`docker-compose.yml`):
backend (Django + gunicorn), frontend (nginx serving the Vite build),
PostgreSQL, and Redis. First deploy, upgrade, rollback, backups and scheduled
jobs are in [`docs/deploy/production-runbook.md`](docs/deploy/production-runbook.md).

### Quick deploy (Docker Compose)

One command builds, migrates (the backend entrypoint runs
`python manage.py migrate --noinput` automatically before starting gunicorn —
see `docker/entrypoint.sh`), and starts every service:

Optionally set `DJANGO_SUPERUSER_USERNAME`, `DJANGO_SUPERUSER_EMAIL`, and
`DJANGO_SUPERUSER_PASSWORD` in `.env` to auto-create the first superuser on
that same first start (`ensure_superuser` management command, run from the
entrypoint right after migrations). No-op if unset, and safe to leave set
permanently — it skips once the user already exists.

```bash
# 1. Copy the env template and fill in real values
cp .env.example .env
#    Required: SECRET_KEY, ALLOWED_HOSTS, FRONTEND_URL, DB_PASSWORD,
#              REDIS_PASSWORD (see .env.example for notes)
#    Optional tuning: DB_CONN_MAX_AGE, GUNICORN_WORKERS, RUN_MIGRATIONS,
#              BACKUP_INTERVAL_SECONDS, BACKUP_RETENTION (documented in
#              docker-compose.yml and docs/deploy/production-runbook.md)

# 2. Build and start every service
docker compose up -d --build

# 3. Verify health (from the host — the frontend port is bound to
#    127.0.0.1 only, see "Ingress" below)
curl -f http://localhost:8080/api/health/ready/   # frontend -> backend
```

Redeploying after a code change is the same command — `up -d --build` only
rebuilds and restarts what changed, and migrations run again automatically
(a no-op if there's nothing new to apply).

**First deploy: plugins.** On boot the entrypoint registers every discovered
plugin (`manage.py sync_plugins`: idempotent, never enables anything). Plugins
start **disabled**: enable the ones you want in Admin → Plugins, then **restart
the backend** (`docker compose restart backend`), because plugin URLs are computed
once at process start. Enabling without a restart leaves the plugin's API routes
returning 404.

**Holidays.** The entrypoint also runs `manage.py sync_payroll_holidays` (idempotent: copies
holidays defined only in Payroll work calendars to HR and mirrors HR ones back).

**HBPR access on existing databases.** The entrypoint also runs `manage.py grant_hbpr_plugin_access`
(after `sync_plugins`), which gives the `hbpr` role `view` on the TL Scorecard and Engagement plugins once;
nothing to do by hand. Details and the role's scope rules: `docs/hbpr-and-scorecard.md`.

**Several backend replicas.** `migrate` and the boot-time commands take no lock.
Set `RUN_MIGRATIONS=0` on every backend container except one (default `1`).

### Ingress: bring your own TLS reverse proxy

`docker-compose.yml` defines **no ingress service**: the Cloudflare Tunnel
connector (`cloudflared`) was removed, so there is no `tunnel` profile and no
`CLOUDFLARE_TUNNEL_TOKEN`. The stack serves plain HTTP on the `frontend`
container (`127.0.0.1:${FRONTEND_PORT:-8080}` on the host, and
`http://frontend:8080` on the `frontend_net` docker network). Put one of these in
front of it, outside this repo:

- a TLS-terminating reverse proxy on the host or another machine (Caddy, nginx
  with certificates, Traefik, an AWS ALB), or
- a Cloudflare Tunnel connector you run yourself, pointed at the frontend.

Requirements for whatever you choose:

1. **Terminate TLS** with a valid certificate (see below).
2. **Send `X-Forwarded-Proto: https`.** `frontend/docker/nginx.conf.template`
   forwards it to Django only when the connection comes from the trusted
   subnet; otherwise it falls back to `http` and Django redirects every request.
3. **Send the real client IP in a header nginx trusts.** nginx reads the
   header named by `INGRESS_REAL_IP_HEADER` (default `CF-Connecting-IP`,
   Cloudflare's). For any other proxy set it in `.env` to the header the proxy
   sets (`X-Real-IP` or `X-Forwarded-For`) and make sure the proxy overwrites it rather than
   appending a client-supplied value. Throttles and the `/api/` rate limit
   depend on it.
4. **Match the trusted subnet.** `INGRESS_TRUSTED_CIDR` (one CIDR, default
   `172.28.0.0/24`, the fixed `frontend_net` subnet) feeds `set_real_ip_from`
   and the `geo` block in the template. A proxy
   container must run on that network inside this range. A proxy on the host
   or elsewhere reaches nginx from another address (for a host proxy via the
   published port, the docker bridge gateway, e.g. `172.28.0.1`), so set
   `INGRESS_TRUSTED_CIDR` to that address (e.g. `172.28.0.1/32`), and nothing
   broader.
5. **Do not publish the frontend port on `0.0.0.0`.** It stays bound to
   `127.0.0.1` so the proxy's TLS and edge protections cannot be bypassed.

`NUM_PROXIES` stays `1` in `settings_production.py`: nginx presents exactly one
trusted hop to Django whatever sits in front of it.

### TLS / HTTPS — required

This repo does **not** terminate TLS anywhere in the stack — `nginx.conf.template` has
no `ssl` listener. Whatever sits in front (see Ingress above) **must**:

1. Terminate TLS with a valid certificate.
2. Reach the frontend container (see Ingress above).
3. Send `X-Forwarded-Proto: https` so Django detects HTTPS behind the proxy
   (`SECURE_PROXY_SSL_HEADER` is configured in `settings_production.py`).
   `nginx.conf.template` forwards this header through unchanged rather than
   substituting its own scheme — it has none to substitute correctly, since
   it never terminates TLS itself.

Without this, `SECURE_SSL_REDIRECT=True` either loops or JWTs/credentials
traverse the network in cleartext, and secure cookies fail. HSTS is set by
both Django and nginx but is only effective over a real TLS connection.

### Secret management

For real production deployments, do **not** rely on plaintext `.env` for
long-lived secrets. Use Docker secrets (mounted files) or an external
secret manager (HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager)
for at minimum:

- `SECRET_KEY` (Django session/token signing — rotate to invalidate all sessions)
- `DB_PASSWORD` (Postgres)
- `REDIS_PASSWORD` (Redis auth — required by compose)
- `EMAIL_HOST_PASSWORD` (SMTP)
- `VAPID_PRIVATE_KEY` (Web Push)

`settings_production.py` fails fast if `SECRET_KEY` is missing, too short
(<50 chars), or matches a known placeholder. `FRONTEND_URL` is also
required (no insecure localhost fallback).

### Database

- **Encryption at rest**: the `postgres_data` volume must live on an
  encrypted backing store — LUKS on bare metal, encrypted EBS on AWS,
  encrypted PD on GCP. This is a host/cloud config concern, not a compose
  setting.
- **Connection SSL**: `DB_SSL_MODE` defaults to `prefer` (encrypts if the
  server supports it). For managed DBs (RDS, Cloud SQL, Supabase), set
  `DB_SSL_MODE=require` or `verify-full` (the latter needs `DB_SSL_ROOTCERT`
  mounted into the backend container).
- **Backups**: the compose file includes a `db-backup` one-shot service
  (under the `backup` profile — not started by `docker compose up`).
  Run a backup manually:
  ```bash
  docker compose --profile backup run --rm db-backup
  ```
  Schedule nightly via host cron:
  ```cron
  0 2 * * * cd /path/to/project && docker compose --profile backup run --rm db-backup
  ```
  Backups are written to the `db_backup` volume as
  `engtracker_YYYY-MM-DD_HHMMSS.dump` (custom-format `pg_dump -Fc`).
  Copy them offsite to an encrypted location. To restore (override the
  entrypoint — the default entrypoint runs `pg_dump`, not `pg_restore`):
  ```bash
  docker compose run --rm --entrypoint pg_restore \
    -v /path/to/backup.dump:/restore.dump db-backup \
    --clean --if-exists --no-owner -d $DB_NAME /restore.dump
  ```
  `--no-owner` skips ownership checks (useful when restoring to a fresh
  DB with a different user). `--clean --if-exists` drops existing objects
  before recreating. Test restores regularly.
  **Retention**: backups accumulate in the `db_backup` volume with no
  automatic cleanup. Prune old backups periodically, e.g.:
  ```bash
  docker compose run --rm --entrypoint sh db-backup \
    -c 'find /backups -name "*.dump" -mtime +30 -delete'
  ```
  (Deletes backups older than 30 days — adjust to your retention policy.)

### Network segmentation

The compose file defines two networks:
- `backend_net` (internal): `db` + `redis` + `backend` only. The frontend
  container cannot reach the database or Redis directly.
- `frontend_net`: `frontend` + `backend` only.

### Health checks

- Backend: `GET /api/health/ready/` (DB + cache probe, returns 200/503).
  Exempt from SSL redirect so direct HTTP probes work.
- Frontend: nginx responds on `/` (wget-based check).
- Both endpoints are unauthenticated for orchestrator use; the ready
  endpoint is IP-throttled to prevent DoS.

### Django admin

Django's built-in admin is served at `/django-admin/` (the custom React admin panel owns `/admin/*`; proxied to the backend by
`frontend/docker/nginx.conf.template`). Static files (`/static/...`,
CSS/JS) are also explicitly proxied to the backend, which serves them via
WhiteNoise — both location blocks were missing until 2026-09-27 (admin was
silently falling through to the SPA and rendering `index.html` instead).
Admin login is not throttled by the DRF `auth` scope (it uses Django's
built-in login view, not a DRF view); `/django-admin/login/` is rate-limited at
the nginx layer instead (`limit_req zone=admin_login`, 5 req/min per IP,
burst 3) — no new Python dependency. Revisit with `django-axes`/`django-otp`
if nginx-layer rate limiting proves insufficient.

### Content-Security-Policy

Enforcing (flipped from report-only 2026-09-27, ~5 weeks with zero
violations). If the onboarding plugin's OnlyOffice document editor is
enabled (`ONLYOFFICE_DOCUMENT_SERVER_URL` on the backend), also set
`ONLYOFFICE_ORIGIN` in `.env` to that URL's origin only (scheme + host +
port, no path — e.g. `https://office.example.com`) so the frontend
container's CSP allows loading the editor script and iframe from it;
leave unset if OnlyOffice isn't used.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/token/` | POST | JWT login |
| `/api/auth/token/refresh/` | POST | Refresh token |
| `/api/users/` | GET/POST | User management |
| `/api/overtime/` | GET/POST | Overtime logs |
| `/api/standby/` | GET/POST | Standby logs |
| `/api/vacations/` | GET/POST | Holiday requests |
| `/api/dashboard/widgets/` | GET | Dashboard stats |

## Testing

### Backend
```bash
# Run all tests (Django test runner; use the 3.14 interpreter on Windows)
py -3.14 manage.py test

# One app or module
py -3.14 manage.py test apps.leave_management
```

### Frontend
```bash
# Run tests
cd frontend
npm test

# Coverage
npm run test:coverage
```

## Project Structure

```
Engineering_tracker/
├── apps/                  # Django apps (users, overtime, standby, etc.)
├── config/               # Django settings and root URLs
├── core/                 # Shared utilities and abstract models
├── plugins/              # Optional feature plugins (13)
├── docs/                 # Tracked docs: invariants, deploy runbook, reviews
├── .devin/               # Local-only AI context (gitignored)
├── frontend/             # React SPA (Vite + React 19)
├── manage.py             # Django entry point
└── README.md             # Project hub
```

## License

MIT License
