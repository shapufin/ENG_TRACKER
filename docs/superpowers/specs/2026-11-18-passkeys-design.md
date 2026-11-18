# Passkeys (WebAuthn) as an alternative second factor: design

Date: 2026-11-18. Status: approved in chat, spec awaiting review.
Builds on `docs/workflow-invariants.md` item 27 and `docs/superpowers/plans/2026-10-25-mfa-totp-implementation-plan.md`.

## 1. Goal and decisions

Users approve sign-in with Face ID, fingerprint or the device PIN instead of typing a TOTP code.

| Decision | Ruling (owner, 2026-11-18) |
|---|---|
| Role | Alternative second factor after the password. Not passwordless. |
| TOTP and backup codes | Unchanged. Fallback and recovery. Either factor satisfies `mfa_required`. |
| Backend dependency | `webauthn` (py_webauthn), built on the already pinned `cryptography`. |
| Frontend | Native `navigator.credentials`. No new npm package. |
| RP ID (production) | `tracker2.integrit.org` (exact host, not `integrit.org`). |
| Push approval | Dropped. Passkeys need no PWA install and no notification permission. |

Success criteria:
1. A user with a passkey signs in with password plus one biometric or PIN prompt, no typed code.
2. A user without a passkey, or on an unsupported browser, signs in exactly as today.
3. No path mints a token before a second factor passes; every check fails closed.
4. Works in a plain mobile browser; on a desktop, the phone is used through the browser's QR/Bluetooth prompt.

Out of scope (YAGNI): passwordless login, a passkey-only requirement per account, attestation verification (`attestation: "none"`), push approval, passkeys on `/django-admin/` login (it keeps the code path).

## 2. Data model (`apps/users/models/mfa.py`, Postgres only)

- `WebAuthnCredential(TimeStampedModel)`: `user` FK (CASCADE, `related_name='passkeys'`), `credential_id` (`BinaryField` or base64url text, unique), `public_key` (bytes), `sign_count` (`PositiveBigIntegerField`), `transports` (JSON list), `name` (max 64, user-chosen), `last_used_at` (null). Plain `models.Model` semantics: no soft delete.
- `WebAuthnChallenge(TimeStampedModel)`: `user` FK (CASCADE), `purpose` (`register` | `login`), `challenge` (bytes), `expires_at` (now + 120 s), `used_at` (null). Consumed once under `select_for_update`; a used or expired row never verifies.
- Both are excluded from Site Backup (`EXCLUDED_MODELS`, same reason as `usermfa`: credentials are not portable restore data) and named in `test_backup_coverage_guard.py`.
- Decision state is never in Redis (`allkeys-lru`).

## 3. Backend (`apps/users/services/webauthn.py`, thin views in `apps/users/views/auth.py`)

Service API (all raise `MFAError` with the existing code vocabulary):
- `registration_options(user) -> dict`, `register(user, response, name) -> WebAuthnCredential`
- `authentication_options(user) -> dict`, `verify_assertion(user, response) -> WebAuthnCredential`
- `list_credentials(user)`, `rename(user, credential_id, name)`, `remove(user, credential_id)`, `remove_all(user)`

Endpoints (names follow the existing `api/auth/mfa/` style):
- `POST api/auth/mfa/passkeys/options/` and `.../register/`: need password step-up, like `mfa/setup/`.
- `GET api/auth/mfa/passkeys/`, `PATCH`/`DELETE api/auth/mfa/passkeys/<id>/`: step-up for delete and rename.
- `POST api/auth/token/passkey-options/` and `api/auth/token/passkey-verify/`: take the `mfa_token` (`make_challenge`/`read_challenge`), end in the existing `issue()`. They sit under `token/` so the refresh cookie path is shared, like `mfa-verify`.
- Enrolment during forced setup: `MFALoginSetupView`/`ActivateView` gain a passkey branch with the same `mfa_token` rules.

Rules:
- `login_challenge(user)` adds `methods` (`["passkey","totp"]` filtered by what the user has). The serializer still authenticates only and returns before minting tokens.
- `is_enrolled(user)` is true when a verified TOTP seed or at least one passkey exists; `status_for` reports both, plus `passkeys` (count, names, last used).
- Assertion checks: challenge matches and is unused and unexpired; origin in `WEBAUTHN_ORIGINS`; RP ID hash matches; user-verification flag required (`UserVerificationRequirement.REQUIRED`); signature valid; `sign_count` must increase when the authenticator reports a non-zero counter (a regression rejects the sign-in and writes `mfa_passkey_clone_suspected`). Authenticators that always report 0 are accepted.
- Wrong attempts share `UserMFA.failed_attempts` and the 5-then-15-minute lock. A passkey user with no `UserMFA` row gets one created lazily (no seed) so the counter has a home.
- A user may not remove their last factor while `required_source(user)` is not null. `disable` on TOTP is refused if it would leave a required user with no factor.
- Admin `reset_mfa` and `manage.py reset_user_mfa` call `remove_all` and revoke refresh tokens (`services/tokens.revoke_refresh_tokens`).
- Audit actions through `services/mfa.audit`: `mfa_passkey_added`, `mfa_passkey_removed`, `mfa_passkey_used`, `mfa_passkey_clone_suspected`. Verify each action name against the audit `action` column length before choosing it (one existing MFA action was already over 20 characters).
- `/django-admin/` login is unchanged.

Settings (`config/settings.py`, environment-driven): `WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, `WEBAUTHN_ORIGINS` (list). Dev defaults `localhost` and `http://localhost:5173`. `config/settings_production.py` refuses to boot when any is unset, the RP ID is not a host suffix of every origin, or an origin is not HTTPS (same pattern as the existing `MFA_ENCRYPTION_KEYS` guard, pinned in `config/test_deployment.py`).

Maintenance: expired or used challenges are deleted lazily whenever a new challenge is created (no scheduler job needed). `manage.py check_webauthn_config` (modelled on `check_mfa_key`) prints RP ID, origins and credential count for the runbook.

## 4. Frontend

- `frontend/src/services/passkeyService.ts`: base64url helpers, `isPasskeySupported()` (`window.PublicKeyCredential` and a secure context), `registerPasskey`, `authenticateWithPasskey`. Base URL follows the `/auth/...` convention (no doubled `api/`).
- Login (`LoginPage`): when the challenge lists `passkey` and the browser supports it, show "Use Face ID / fingerprint" as the primary action and "Use a code instead" below it. A cancelled or failed prompt shows the code field, never a dead end.
- Settings Security block: a Passkeys list (name, added, last used) with add, rename, remove. Remove asks for password through the existing step-up dialog.
- `MfaPromptModal` and forced setup offer "Set up a passkey" first where supported, "Use an authenticator app" otherwise. The prompt stays a prompt; enforcement is server-side.
- Copy never says "TL"; errors state what, why and how (ux-writing). No `prompt()`/`confirm()`.
- Unsupported (in-app webviews, old Android): the passkey option is hidden and the flow is TOTP only.

## 5. Test strategy (TDD, red first)

Backend (`apps/users/tests_app/test_webauthn_service.py`, `test_webauthn_auth.py`): a test authenticator built with `cryptography` (ES256 key, builds `attestation: none` and assertion payloads) so tests exercise real verification. Cases: register and sign in; replayed challenge; expired challenge; wrong origin; wrong RP ID; missing user-verification flag; counter regression; counter always 0; lockout shared with TOTP; token never issued on failure (no `OutstandingToken` row); required user cannot remove last factor; admin reset wipes passkeys and revokes tokens; enrolled user with only a passkey still gets challenged; fail closed on missing settings (503, never password-only). Pin query counts for login and status.

Frontend (vitest): service helpers, supported/unsupported branches, cancelled prompt falls back to the code field, Settings list actions, `LoginPage.mfa` tests extended.

E2E (Playwright, Chromium CDP virtual authenticator): register a passkey, log out, sign in with it, sign in with a code instead, rename, remove. This is the Frontend gate click-through; a screenshot alone is not enough. Run on both desktop and 393 px projects.

Guards: `test_backup_coverage_guard.py` names both tables; `apps/permissions/test_row_ownership_matrix.py` covers the new routes; a source-walk test asserts no view other than `issue()` callers builds tokens.

## 6. Documentation and maintenance

Docs: new `docs/workflow-invariants.md` item (or an addendum to 27) with the rules above; a CLAUDE.md Hot Invariant line; runbook 5.7 and `docs/deploy/server-migration-checklist.md` (credentials travel with the database, no key needed, but the hostname must stay `tracker2.integrit.org` or users re-enrol); `.env.example` and the production env docs gain the three `WEBAUTHN_*` variables; user-facing help text for adding a passkey.

Future-change checklist (added to the item): any new way to obtain a session honours `login_challenge` and the passkey methods; any new `UserViewSet` credential action joins the `IsAdminUser` list; a hostname or proxy change re-runs `check_webauthn_config`; bump review of the `webauthn` pin with each Django upgrade (UPGRADE-JOURNAL); watch `mfa_passkey_clone_suspected` in the audit log.

Review gates before merge: code-review skill, security-review on the service and views (replay, origin and counter handling), `django-perf-review` on login and status, ruff, tsc, eslint, the full backend and vitest suites, and the browser pass above.

## 7. Review focus (inputs the happy path misses)

1. Two tabs or devices start sign-in at once: each gets its own challenge; one consuming does not break the other.
2. A user with a passkey but no TOTP seed and `mfa_required` on: still challenged, never password-only.
3. The same authenticator registered twice: unique `credential_id` returns a clear 409, not a 500.
4. Browser reports `transports` or `sign_count` oddly (0 forever, missing): accepted per the rules, never a crash.
5. Hostname or reverse-proxy change in production: the production boot guard and `check_webauthn_config` catch a wrong RP ID or an `http` origin before users hit it.
