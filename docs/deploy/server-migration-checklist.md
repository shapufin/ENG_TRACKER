# Moving to a new server

Everything the app needs is in git, the Postgres database, the `media_files` volume, and a short list of
secrets in `.env`. Nothing else is state. This page is the ordered checklist. Rehearse it once in a
throw-away project before you need it: `docker compose -p et-rehearsal ...` with a restored dump.

## 1. What must travel

| Item | Where it lives | Carry how | If you lose or change it |
|---|---|---|---|
| Database | `postgres_data` volume | `pg_dump` / `pg_restore` (runbook section 4.1), same Postgres major (16) | Everything |
| Uploaded files | `media_files` volume | media tar from the `db-backup` job (runbook 4.2) | Documents, logos, evidence |
| `SECRET_KEY` | `.env` | password manager | Everyone is signed out; signed values (OnlyOffice document keys) are re-issued |
| `MFA_ENCRYPTION_KEYS` | `.env` | password manager, **never** in the backup volume | Every user with two-factor on cannot sign in (fails closed) until reset |
| `DB_PASSWORD`, `REDIS_PASSWORD` | `.env` | any new value is fine | Nothing else depends on them |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `.env` | password manager | Every browser's push subscription stops working |
| `ONLYOFFICE_JWT_SECRET`, `EMAIL_*` | `.env` | password manager | Must match the OnlyOffice and SMTP servers |
| Host names | `.env`: `ALLOWED_HOSTS`, `FRONTEND_URL`; `INGRESS_TRUSTED_CIDR` | edit for the new host | 400/CSRF errors, or every user sharing one rate-limit bucket |
| Redis, static files | `redis_data`, `static_files` | do not carry | Cache and build output, rebuilt on start |

Rule that keeps this true: **nothing authoritative may live in Redis** (it runs `allkeys-lru`).
Two-factor replay and lockout state is therefore in Postgres.

## 2. Cutover, in order

1. On the old server: take a fresh dump and media archive (runbook section 3), copy both off the host.
2. On the new server: install Docker, **check the clock is NTP-synced** (`timedatectl status`). Two-factor
   codes are time based; a host a minute off rejects honest codes. Container timezone does not matter.
3. Clone the repo at the same commit as production. Create `.env` from the password manager.
4. Start only `db`, restore the dump (runbook 4.1), restore media (4.2).
5. `docker compose up -d --build`. Read the backend boot log:
   - `All N MFA seeds are readable.` means the key matches. `WARNING: MFA seeds are unreadable` means stop and fix the key.
   - the entrypoint runs migrations and the boot reconciliation steps (runbook 5.1).
6. Walk the ingress checklist (runbook 5.5): proxy address trusted, `NUM_PROXIES` correct.
7. `curl -f http://127.0.0.1:8080/api/health/ready/`, then sign in as a superuser and as an enrolled user.
8. Only then move DNS. Keep the old server untouched until a day of normal use has passed.

## 3. Rollback

DNS back to the old server. If users wrote data on the new one, dump it and restore on the old one
(runbook section 4) before the move back.

## 4. After the move

- Re-run `docker compose exec backend python manage.py check_mfa_key` and `check --deploy`.
- Rotate anything that was exposed during the move (`SECRET_KEY` signs people out; rotate the two-factor
  key with the prepend-then-`--reencrypt` procedure in runbook 5.7).
- Update the backup schedule (`--profile backup`) and copy dumps off the new host.
