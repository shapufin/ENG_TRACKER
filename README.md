# Engineering Time Tracker

> **CORE DIRECTIVE**: This project operates under **The Agency Protocol**. All development is guided by specialized AI agents.

A comprehensive time tracking and management system for engineering teams, built with Django 5.2 and React 19.

---

## ✨ Project Quality Summary

| Metric | Status |
|--------|--------|
| **Type Safety** | ✅ Strict TypeScript, Zero `any` in core components |
| **Accessibility** | ✅ WCAG AA Compliance (aria-labels, tree navigation) |
| **Backend Security** | ✅ Role-based ViewSet restrictions implemented |
| **Performance** | ✅ TanStack Query caching, Lazy-loaded admin routes |
| **Cache System** | ✅ Production-grade Redis with versioning |
| **Consistency** | ✅ 100% enterprise-grade naming & patterns |

### 🚀 Optimization Highlights
- **DataTable Optimization**: Reusable, type-safe data grid with tree support.
- **Glassmorphism UI**: Modern, dark-first design system with semantic tokens.
- **Auto-Dispatch Workflow**: Integrated AI agent system for accelerated development.
- **Production-Grade Caching**: Redis backend with automatic versioning & invalidation.
- **Enterprise Consistency**: 100% consistent naming, schemas, and API patterns.

---

## 🏛️ The Agency Protocol

This repository is optimized for AI-assisted development using specialized agents.

### 🤖 Agent Dispatch
The project uses an automatic dispatch system ([.devin/workflows/agent-dispatch.md](.devin/workflows/agent-dispatch.md)) to activate the correct specialist based on your prompt:

| Domain | Keywords | Specialist Agent |
|--------|----------|------------------|
| **Backend** | django, models, API, migrations | Backend Architect |
| **Frontend** | UI, React, CSS, components | UI Designer → ArchitectUX → Frontend Developer |
| **Audit** | refactor, cleanup, debloat | Software Architect |
| **Security** | auth, permission, review | Security Engineer |

### 🛠️ Activation
Simply describe your task. The system will auto-dispatch. For manual override:
`"As a Backend Architect, optimize this model..."`

---

## 📊 Project Status & Health

### ✅ Latest Audit Report (2026-05-30)
**Comprehensive audits completed**:
- ✅ Production-Grade Cache System Implementation
- ✅ Enterprise-Grade Consistency Audit (100% pass)
- ✅ Full Application Cache & Real-Time Data Audit
- ✅ Code Quality Verification (All modules)

View detailed tracking: **[.devin/tracking/CHANGES_OPTIMIZED.md](.devin/tracking/CHANGES_OPTIMIZED.md)**

### � Quick Health Check
Run these commands to verify system integrity:

**Backend (Python 3.12+):**
```bash
python manage.py check
python manage.py test
```

**Frontend (Node 20+):**
```bash
cd frontend
npm run lint
npx tsc --noEmit
```

---

## �� Documentation

Project documentation is organized in `.devin/` (AI context) and `frontend/` (frontend-specific).

> **For AI assistants:** Read **[.devin/context/03-FRONTEND-PATTERNS.md](.devin/context/03-FRONTEND-PATTERNS.md)** for all frontend UI conventions, tokens, and component patterns.
> **For AI file navigation:** Read **[.devin/context/PROJECT_INDEX.md](.devin/context/PROJECT_INDEX.md)** for a complete file map.
> **For AI context:** Read **[.devin/context/00-INDEX.md](.devin/context/00-INDEX.md)** for permission system, patterns, and common task recipes.

| Document | Description |
|----------|-------------|
| [.devin/context/00-INDEX.md](.devin/context/00-INDEX.md) | AI context navigation hub |
| [.devin/context/03-FRONTEND-PATTERNS.md](.devin/context/03-FRONTEND-PATTERNS.md) | **Frontend patterns and conventions** |
| [.devin/context/PROJECT_INDEX.md](.devin/context/PROJECT_INDEX.md) | Complete file map |
| [.devin/rules/CONTEXT.md](.devin/rules/CONTEXT.md) | **Always-on invariants and rules** |
| [.devin/tracking/SENIOR_AUDIT_2026-07-31.md](.devin/tracking/SENIOR_AUDIT_2026-07-31.md) | Latest audit report |

## Features

- **User Management**: Role-based access control (Employee, Team Leader, HR)
- **Overtime Tracking**: Log and approve overtime hours with client/project details
- **Standby Management**: Track on-call and standby hours
- **Vacation Management**: Holiday requests with calendar view and balance tracking
- **Dashboard**: Role-based dashboards with statistics and summaries
- **Admin Panel**: Dashboard for comprehensive data management and system configuration
- **Tree-View Teams**: Hierarchical team management with automated member synchronization
- **Reports**: Advanced report generation with animated statistics and multi-format export

## Progressive Web App (PWA)

The Engineering Tracker is installable as a PWA on desktop and mobile
browsers. See `.devin/plans/plan-mobile-pwa-readiness-2026-08-15.md` for
the full readiness plan and acceptance criteria.

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

## Tech Stack

### Backend
- Django 5.2.4
- Django REST Framework (DRF)
- JWT Authentication (SimpleJWT) with startup validation
- PostgreSQL (Production) / SQLite (Dev)
- Redis Caching

### Frontend
- React 19 (Dark-first design)
- TypeScript (Strict mode)
- Tailwind CSS with semantic tokens
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
PostgreSQL, and Redis. The deployment hardening plan lives at
[`.devin/plans/plan-production-security-2026-08-21.md`](.devin/plans/plan-production-security-2026-08-21.md).

### Quick deploy (Docker Compose)

```bash
# 1. Copy the env template and fill in real values
cp .env.example .env
#    Required: SECRET_KEY, ALLOWED_HOSTS, FRONTEND_URL, DB_PASSWORD,
#              REDIS_PASSWORD (see .env.example for notes)

# 2. Build and start all services
docker compose up -d --build

# 3. Verify health
curl -f http://localhost:8080/api/health/ready/   # frontend -> backend
```

### TLS / HTTPS — required

This repo does **not** terminate TLS. An upstream proxy (Cloudflare, AWS
ALB, nginx-with-certs, or Caddy) **must** sit in front of the frontend
container and:

1. Terminate TLS on port 443 with a valid certificate.
2. Forward traffic to the frontend container's published port (default 8080).
3. Send `X-Forwarded-Proto: https` so Django detects HTTPS behind the proxy
   (`SECURE_PROXY_SSL_HEADER` is configured in `settings_production.py`).

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

The admin UI is served at `/admin/` (proxied to the backend). Static
files (CSS/JS) are served via WhiteNoise in production. Admin login is
**not** throttled by the DRF `auth` scope (it uses Django's built-in
login view, not a DRF view) — rely on strong unique passwords for
staff/superusers and consider adding `django-axes` or an nginx IP
allowlist before any internet-facing deploy.

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
# Run all tests
pytest

# Run with coverage
pytest --cov=apps --cov-report=html
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
├── .devin/               # AI context, rules, tracking, workflows
├── frontend/             # React SPA (Vite + React 19)
├── manage.py             # Django entry point
└── README.md             # Project hub
```

## License

MIT License
