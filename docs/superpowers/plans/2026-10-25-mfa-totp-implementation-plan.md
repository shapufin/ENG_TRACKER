# Plan: Multi-Factor Authentication (TOTP + Backup Codes)

**Date**: 2026-10-25 · **Revision**: 2 (code-verified review of draft 1) · **Status**: IMPLEMENTED on branch `feat/mfa-totp` (uncommitted), browser-verified 2026-10-25. Deviations from this plan: TOTP is stdlib (no `pyotp`); endpoints are `/api/auth/mfa/*` plus `/api/auth/token/mfa-verify/`; enforcement is global switch OR per-user flag (section 2).
**Surface**: `apps/users/` (auth views, serializers, models), `config/` (settings, urls, admin), `plugins/site_backup`, Docker/runbook, `frontend` (login, settings).

Goal: optional-then-enforced TOTP (RFC 6238) with single-use backup codes. Self-hosted, no vendor, no SMS. No behaviour change for users who have not enrolled. Must survive a server move with one documented step (copy the key).

## 1. What the review verified in the code (draft 1 was wrong or silent on these)

| # | Finding | Evidence | Consequence for the plan |
|---|---|---|---|
| F1 | **`/django-admin/` session login bypasses MFA completely, including for the API.** DRF's default auth list includes `SessionAuthentication`, so a session cookie from the Django admin login authenticates `/api/*`. | `config/settings.py` `DEFAULT_AUTHENTICATION_CLASSES`; `config/urls.py` `django-admin/` | Admin MFA is mandatory, not an add-on. Gate the Django admin login, not just JWT. |
| F2 | `TokenObtainPairSerializer.validate` already creates the refresh token and an `OutstandingToken` row before the view runs. "Do not issue the cookie" in the view is not enough. | `CustomTokenObtainPairView.post` pops `refresh` after `super().post()` | Branch inside the serializer, before any token is minted. Otherwise every enrolled login leaves an orphan outstanding token. |
| F3 | A "challenge JWT with an `action` claim" signed by the same key can be accepted as an access token if `token_type` is `access`. | SimpleJWT `AUTH_TOKEN_CLASSES` default | Do not use a JWT for the challenge. Use a Django `signing` value (own salt, 5 min, binds user id + password fingerprint so a password change kills it). |
| F4 | Redis is configured `allkeys-lru` with 256 MB. Keys can be evicted, and Redis is a cache here. | `docker-compose.yml` redis command | Replay protection and lockout counters live in Postgres, never Redis. Redis stays only for the DRF scope throttle that already uses it. |
| F5 | The existing `auth` throttle is 20/min per IP (`NUM_PROXIES=1`). Per-IP throttling alone does not stop a distributed or shared-NAT guess of a 6-digit code. | `settings_production.py` | Add per-user lockout in the DB (5 fails, 15 min) in addition to a new `mfa` throttle scope. |
| F6 | Site Backup dumps **every** model except `contenttypes`, `sessions`, `site_backup`. | `plugins/site_backup/services/backup.py` `EXCLUDED_APPS` | New MFA tables would land in downloadable archives, and a restore would roll MFA state back (re-enable a disabled factor, revive spent codes). Exclude them at model level. |
| F7 | `docker-compose.yml` passes variables to `backend` by an explicit `environment:` list. A new key only in `.env` never reaches the container. | `docker-compose.yml` backend env | Add `MFA_ENCRYPTION_KEYS` there with the `:?` required form, like `SECRET_KEY`. |
| F8 | `pyotp.TOTP.verify(valid_window=1)` does not say which step matched, so `last_used_step` cannot be stored correctly from it. | pyotp API | Compare candidate steps (-1, 0, +1) manually, accept only a step greater than `last_used_step`, store that step. |
| F9 | Draft 1 CLI example is `py -3.14 manage.py ...`. Production is Docker. | `docs/deploy/production-runbook.md` | Break-glass is `docker compose exec backend python manage.py reset_user_mfa <username>`. |
| F10 | `reset_password` already encodes the right authority rule (staff cannot reset staff or superuser; only a superuser can) and revokes outstanding refresh tokens (SEC-10). | `apps/users/viewsets.py` `reset_password` | Reuse the same rule and the same token revocation for MFA reset (extract one shared helper, do not copy). A new `@action` must also be added to the `IsAdminUser` list in `get_permissions`, or it is open to any authenticated user. |
| F11 | Pins in draft 1 (`cryptography==44.0.0`, `pyotp==2.9.0`, `qrcode[pil]==8.0`) are not checked against this repo, whose other pins are 2026 versions. | `requirements.txt` | Pick pins at implementation time from the then-current release, run `pip install -r` in a clean env and the Docker build. Do not copy numbers from this plan. |

## 2. Design

**Models** (`apps/users/models/mfa.py`, exported from `models/__init__.py`). Plain `models.Model` or `TimeStampedModel`, **not** `BaseModel` (soft delete is wrong for credentials; same reasoning as `UserTech`).
- `UserMFA`: one-to-one user, `secret_ciphertext`, `is_enabled`, `enabled_at`, `last_used_step`, `failed_attempts`, `locked_until`.
- `MFABackupCode`: user FK, per-code random salt, SHA-256 digest, `used_at`. Ten codes of 12 characters from an unambiguous base-32 alphabet (about 60 bits), so a fast salted hash is sound. Argon2 is not installed and PBKDF2 x10 per attempt is too slow. Compare in constant time.

**Secret encryption**: `core/utils/crypto.py` using Fernet **MultiFernet**, key list from `MFA_ENCRYPTION_KEYS` (comma separated, first key encrypts, all keys decrypt). This is the rotation and migration lever: add a new key first, re-encrypt, then retire the old one. Production boot raises `ImproperlyConfigured` when unset (same pattern as `FRONTEND_URL`). Dev/test derive a key from `SECRET_KEY` only when `DEBUG`.

**Login handshake**
1. `CustomTokenObtainPairSerializer.validate`: authenticate, then if the user has an enabled factor return `{mfa_required: true, mfa_token}` and mint nothing (F2). Response is HTTP 200 and has no `access`.
2. `POST /api/auth/token/mfa-verify/` (path chosen so the existing refresh cookie path `/api/auth/token/` matches): verify challenge (F3), check lock, verify TOTP then backup code inside one `transaction.atomic` with `select_for_update` on the `UserMFA` row. TOTP per F8. Backup code consumed by a conditional `UPDATE ... WHERE used_at IS NULL` and checking the row count, so two parallel gunicorn workers cannot both spend it.
3. Success reuses `CustomTokenObtainPairSerializer.get_token` (so role claims are identical to a normal login) and one shared cookie helper extracted from the three places that set `refresh_token` today.
4. Fail closed: if decryption fails (wrong key after a move), enrolled users get 503 plus an error log, never a password-only login.
5. Scope `mfa` throttle: literal rate in `settings_production.py` (SEC-01 note applies), `None` in dev, automatically disabled in `settings_e2e.py`. `test_deployment.py` pins the rate dict, update it.

**Enrollment** (next to the token routes under `/api/auth/mfa/`, confirm the user URL layout in step 0 before fixing paths): `setup` (creates a pending, not enabled secret; overwrite allowed while pending), `activate` (valid code turns it on and returns the ten codes once), `disable`, `backup-codes` regenerate. `disable`, `backup-codes` and re-`setup` need **password and a current code**. Draft 1 required only the password, so a stolen session plus a leaked password could remove the factor. QR: render server-side as SVG with `qrcode` (no Pillow needed) or return only the `otpauth://` URI and draw it client-side. Never log the secret or URI.

**Django admin (F1)**: custom `AdminSite` login form with an OTP field, enforced for any user with an enabled factor. Add a test that logging in at `/django-admin/` and then calling `/api/` with the session cookie is refused for an enrolled user without the code.

**Admin reset**: `reset_mfa` action on `UserViewSet`, listed in `get_permissions` `IsAdminUser` set, same superuser-for-staff rule as `reset_password`, not usable on yourself (self uses `disable`), revokes outstanding refresh tokens via the shared helper, writes an audit event through the optional-plugin pattern (`except ImportError` only, core never imports `audit_log`). CLI `reset_user_mfa` does the same and also logs.

**Policy (decided D1, 2026-10-25)**: MFA is optional for everyone at first (any user can enrol in Settings). Enforcement is admin-controlled, two levels, effective rule = global OR individual:
- **Global**: `GlobalSettings.mfa_required` (existing singleton, superuser-write, shown on the admin Global Settings page). Off by default.
- **Individual**: `UserProfile.mfa_required` checkbox in the admin user form (and the user detail panel), default off, so one person or one role group can be forced while the global switch stays off.
- A user who is required but not enrolled logs in with password, gets `mfa_setup_required` plus a short-lived setup challenge (same signer, different purpose), enrols inline, and only then receives tokens. Never a dead end, never tokens before the factor exists.
- Turning enforcement off never removes an enrolled factor; an enrolled user is always challenged.
- Only superusers change the global switch; admins (`IsAdminUser`) change the per-user flag, same authority rules as other credential-adjacent fields (staff cannot flip it on staff/superuser accounts). Both writes are audit-logged.
- The flag lives on `UserProfile` (not `UserMFA`) so it can be set before the person has any MFA row.

## 3. Docker, deployment and rollback

- `docker-compose.yml`: add `MFA_ENCRYPTION_KEYS` to the backend `environment` with `:?`; add to `.env.example`, `README.md` production section and runbook section 5 first-deploy list. Update `config/test_deployment.py` pins.
- Entrypoint (inside the `RUN_MIGRATIONS=1` branch): run a `check_mfa_key` command that tries to decrypt every enrolled row and logs a loud `ERROR` on failure. Non-fatal for boot (consistent with the other reconciliation steps); the login path already fails closed.
- Migration is additive (two new tables), safe on Postgres and SQLite, no data backfill. `makemigrations --check` and `showmigrations users` in the gate (CLAUDE.md dev-DB rule).
- **Rollback hazard (new)**: rolling the code back to a release without MFA silently downgrades enrolled users to password-only, because the old login view ignores the tables. Runbook section 5 rollback must say so and require a decision (accept, or disable the scheme first).
- Key storage rule: the key is **not** stored in or next to the `db-backup` volume, otherwise encrypting the secret protects nothing. Keep it in the password manager with `SECRET_KEY`, `DB_PASSWORD`, VAPID and OnlyOffice secrets.
- Site Backup (F6): exclude `users.usermfa` and `users.mfabackupcode` at model level in `backup.py`, extend `test_backup.py`/`test_restore.py`, and state in the runbook that **server migration uses `pg_dump`/`pg_restore`**, which carries the encrypted rows, not Site Backup.
- Time: TOTP uses UTC epoch, so container timezone is irrelevant. What matters is the Docker **host** clock (NTP on Linux; on Docker Desktop/WSL the clock can drift after sleep). Add to the cutover checklist: compare host time with a trusted source before routing traffic.

## 4. Server-migration readiness for the whole app (requested scope)

State that lives outside git and the database, and must be carried or re-created on a new host:

| Item | Where | If lost or changed |
|---|---|---|
| `SECRET_KEY` | `.env` | All JWTs, sessions and signed values invalid. Users re-login. Verify in step 0 what else is derived from it (OnlyOffice signed `key`, signing salts). |
| `MFA_ENCRYPTION_KEYS` | `.env` | Every enrolled user locked out (fail closed). Recovery only via `reset_user_mfa` plus re-enrolment. |
| `DB_PASSWORD`, `REDIS_PASSWORD` | `.env` | Re-create is fine, nothing else depends on them. |
| `VAPID_PUBLIC_KEY`/`PRIVATE_KEY` | `.env` | Regenerating invalidates every browser push subscription. Carry them. |
| `ONLYOFFICE_JWT_SECRET` | `.env` | Must match the OnlyOffice server. |
| Volumes `postgres_data`, `media_files` | Docker | Real data. Move via `pg_dump` and the media tar from the `db-backup` job. |
| Volumes `redis_data`, `static_files` | Docker | Disposable (cache, rebuilt by collectstatic). Never put authoritative state in Redis (F4). |
| `FRONTEND_URL`, `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, `INGRESS_TRUSTED_CIDR`, `NUM_PROXIES` | `.env`/settings/nginx | A different ingress depth silently changes which IP DRF throttles on (all users share one bucket, or an attacker spoofs one). Re-verify after every move. |
| PostgreSQL major version | `postgres:16` | Restore to the same major first, upgrade separately. |

Deliverables: `docs/deploy/server-migration-checklist.md` (this table plus ordered cutover and rollback steps) and one **rehearsal**: restore the latest dump into a throw-away compose project (`docker compose -p et-rehearsal`) with only the carried secrets, log in as an enrolled user. This also closes the open "host rehearsal" item from the launch review. Do this as its own PR, it is not MFA-specific.

## 5. Phases (each a fresh branch off main, TDD, targeted tests while iterating, full suite once)

0. **Pre-flight, no code**: confirm users URL layout and the audit-log call pattern used in `UserViewSet`; confirm what derives from `SECRET_KEY`; check `cryptography`/`Pillow` already present transitively; run `spectacular --validate` baseline.
1. **Foundations**: deps, `core/utils/crypto.py`, models, migration, settings (`MFA_ENCRYPTION_KEYS`, `mfa` scope), compose/.env.example/test_deployment pins, Site Backup exclusion, `check_mfa_key`.
2. **Handshake**: serializer branch, challenge signer, `mfa-verify`, lockout, replay, shared cookie helper, fail-closed path, Django admin login form.
3. **Management**: enroll/activate/disable/regenerate with step-up, `reset_mfa` action, `reset_user_mfa` CLI, shared token-revocation helper, audit events.
4. **Frontend**: `AuthResponse` union and `authService.login` two-step, `AuthContext`, `LoginPage` code step (autofocus, `autocomplete="one-time-code"`, backup-code toggle, keyboard and 320px), Settings security card, QR dialog, one-time backup-code dialog with copy/print. No `prompt()`/`confirm()`; labelled inputs; tone tokens; run the modal and control audits.
5. **Docs and gate**: runbook sections (key handling, rotation, break-glass via `docker compose exec`, rollback hazard), `docs/workflow-invariants.md` item, CLAUDE.md Hot Invariant line, then policy switch (D1) as its own small PR.

## 6. Test points

Backend: non-enrolled login unchanged; enrolled login returns no `access`, no cookie, no `OutstandingToken` row; challenge rejected as bearer token, expired, tampered, or after password change; code reuse in the same step rejected; the +-1 step window; wrong key returns 503 not a password-only login; 5 failures lock the user even from a new IP; two concurrent backup-code spends yield one success; `mfa` throttle; `disable`/`regenerate` refuse without code; staff cannot reset a superuser's MFA, nobody via the admin action on themselves, employee gets 403 (`test_row_ownership_matrix` style); reset revokes refresh tokens; Django admin login blocked without code and the session cannot reach `/api/`; Site Backup archive contains no MFA rows and restore leaves them untouched; `makemigrations --check`; deployment pins.
Frontend: login two-step, wrong code message, backup-code path, settings enrolment, token never stored in storage, 401 interceptor does not loop on `/auth/token/mfa-verify/`.
E2E: existing login helpers must pass unchanged (users are unenrolled).

## 7. Out of scope (deliberate, YAGNI)

WebAuthn/passkeys, SMS or email codes, "remember this device", social login. The password-change screen is still a placeholder in `SettingsPage.tsx`; MFA does not depend on it, but it should not ship before MFA is considered complete for password-only accounts.

## 8. Risks that remain after this plan

Users who lose both device and codes depend on an admin (by design). A leaked `MFA_ENCRYPTION_KEYS` plus a DB dump exposes the TOTP seeds (mitigation: keep them apart, rotate via MultiFernet). TOTP is phishable by a live relay; only WebAuthn fixes that, hence the out-of-scope line is a conscious trade.

## 9. Open decisions (need an answer before Phase 1)

- **D1 Enforcement**: DECIDED, optional first; global switch plus per-user checkbox (section 2 Policy).
- **D2 QR**: server-side SVG via `qrcode`, no new npm dependency (default taken).
- **D3 Site Backup**: exclude MFA tables (default taken).

## 10. Implementation workflow (build and verify in one pass)

Each phase: failing test, implement, targeted tests, then drive the real UI in the browser (dev servers, light and dark, 375px, keyboard only, console and network clean) before moving on. Bugs found in the browser get a regression test first. Branch `feat/mfa-totp`; no commits unless asked.
