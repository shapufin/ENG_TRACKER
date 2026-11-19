# Phone approval sign-in (push + QR fallback): design

Date: 2026-11-19. Status: owner asked for it in chat, spec awaiting review.
Builds on `docs/workflow-invariants.md` items 27 and 89 and `docs/superpowers/specs/2026-11-18-passkeys-design.md`.
**This reverses one ruling of the passkey spec** ("Push approval: Dropped"). The owner now wants it, so this spec is the new ruling; item 89 gets a pointer to it.

## 1. Goal and decisions

A user on a Windows PC (any browser) clicks "Use my phone", gets a notification on their paired phone, confirms a number, scans their face or fingerprint on the phone, and the PC signs in. When push cannot reach the phone, the PC shows a QR code and the phone opens the same approval page.

| Decision | Ruling |
|---|---|
| Role | One more second factor after the password, beside TOTP and passkeys. Not passwordless. |
| Phone identity | A **paired phone** = one of the user's existing passkeys (`WebAuthnCredential`) created on that phone, plus that browser's push endpoint. No new credential type. |
| Approval proof | A WebAuthn assertion from the paired passkey with user verification required (Face ID / fingerprint / PIN), bound to this one request. Not a bare "Approve" tap. |
| Phone session | None needed. The phone does not have to be signed in: the passkey assertion is the authentication. |
| PC browser | Plain HTTP only (request, poll). No WebAuthn on the PC, so Firefox and old browsers work. |
| Number matching | PC shows a 2-digit number. The phone shows three numbers and the user taps the one on the PC. One wrong tap ends the request. |
| Push transport | Existing Web Push (VAPID). The notification carries only a title and the approval URL. |
| Core vs plugin | `apps/users` never imports `plugins.notifications` statically. A lazy import inside `try/except ImportError` sends the push; without the plugin the flow is QR only. |
| Kill switch | `PHONE_APPROVAL_ENABLED` (env). Off, the `phone` method never appears and every endpoint answers 404. |

Success criteria:
1. With a paired phone, sign-in is password, then one tap on the number and one biometric prompt on the phone. No typed code.
2. A user with no paired phone, or with the switch off, signs in exactly as today (same `methods`, same responses, same query counts).
3. No path mints a token before the phone proves the request; every check fails closed.
4. A lost or stolen phone is cut off by removing the pairing or the passkey in Settings, and by `reset_user_mfa`.

Out of scope (YAGNI): passwordless login, approving without a biometric, approving from a signed-in desktop tab, location lookup of the requester IP, a bell notification for approvals, SMS or email approval, more than the three live requests per user below.

## 2. Data model (`apps/users/models/mfa.py`, Postgres only, plain `TimeStampedModel`)

- `PairedPhone`: `user` FK (CASCADE, `related_name='paired_phones'`), `credential` OneToOne to `WebAuthnCredential` (CASCADE, `related_name='paired_phone'`, so removing the passkey unpairs the phone), `name` (max 64), `push_endpoint` (`URLField(max_length=500, blank=True)`, blank = QR only), `last_used_at` (null).
- `PhoneLoginRequest`: `public_id` UUID (unique, `uuid4`, goes in URLs), `user` FK (CASCADE), `status` (`pending` | `approved` | `denied`), `number` (10 to 99), `options` (JSON list of the three numbers shown on the phone, shuffled), `challenge` (32 bytes), `collector_digest` (sha256 hex of the key only the requesting PC holds), `expires_at` (now + 120 s), `decided_at`, `consumed_at`, `credential` FK null (which passkey approved), `requester_ip` (null), `requester_agent` (max 200).
- Decision state is never in Redis. A request is consumed once under `select_for_update`. Expired, denied and consumed rows older than one hour are deleted lazily whenever a request is created (same as `WebAuthnChallenge`).
- Both models go into `HOUSEKEEPING_MODELS` (`apps/users/services/user_deletion.py`): they are state, not history, so they must not block a user delete.

## 3. Backend (`apps/users/services/phone_approval.py`, thin views in `apps/users/views/auth.py`)

Service API (raises `MFAError`, existing code vocabulary plus `request_expired`, `request_used`, `too_many_requests`, `wrong_number`, `no_phone`):
- `phone_approval_enabled() -> bool`, `request_approval(user, via, ip, agent) -> ApprovalStart` (creates the row, sends push when `via='push'`).
- `approval_view(public_id) -> dict` (numbers, requester summary, WebAuthn request options with the request's challenge and only the user's paired credentials).
- `decide(public_id, decision, number=None, response=None) -> None`.
- `collect(user, public_id, collect_key) -> str` returns `'pending' | 'denied' | 'expired'` or consumes an approved request and returns `'approved'`.
- Pairing: `pair(user, credential_pk, name, push_endpoint)`, `list_phones(user)`, `rename`, `remove`, `remove_all(user)`.

Endpoints (`config/urls.py`, throttle scope `mfa`, no auth classes on the sign-in ones):

| Endpoint | Who | Purpose |
|---|---|---|
| `POST api/auth/token/phone-request/` `{mfa_token, via}` | PC after password | Create request, push, return `{request_id, number, collect_key, expires_in, pushed, qr_svg, approve_url}` |
| `POST api/auth/token/phone-collect/` `{mfa_token, request_id, collect_key}` | PC polling | `202 {status}` until approved, then the normal signed-in response through `_complete_mfa_login` |
| `GET api/auth/phone/requests/<public_id>/` | phone | Numbers, requester summary, assertion options |
| `POST api/auth/phone/requests/<public_id>/decide/` `{decision, number, response}` | phone | Approve (assertion required) or deny |
| `GET/POST api/auth/mfa/phones/`, `PATCH/DELETE .../<id>/` | signed-in phone | Pair, list, rename, unpair; step-up like passkeys |

`phone-collect` sits under `token/` so it shares the refresh-cookie path like `mfa-verify`.

Rules:
- `login_challenge` and `status_for` add `phone` to `methods` only when the switch is on, WebAuthn is available and the user has a paired phone. Otherwise the payload is byte-identical to today.
- Approval needs, all at once: request pending, unexpired, not consumed; `number` equal to the request number; an assertion verified against the request's challenge, RP ID and origin, user verification set, signature valid, counter rule as in item 89; the credential belongs to the request's user **and** is paired. Anything else changes nothing except the shared failure counter.
- A wrong number denies the request and counts as a failure on `UserMFA.failed_attempts` (shared 5 failures then 15-minute lock with TOTP and passkeys). A failed assertion counts the same. A locked user gets `locked` everywhere.
- Collection needs the `mfa_token` (password step still valid, fingerprint of the password) **and** the `collect_key` (only its digest is stored). A leaked approval URL alone cannot sign anyone in.
- At most 3 live requests per user (`too_many_requests`), so push cannot be spammed.
- The maintenance check applies to creation, decision and collection (a request made before the switch must not finish).
- Audit through `services/mfa.audit`: `mfa_phone_paired`, `mfa_phone_removed`, `mfa_phone_approved`, `mfa_phone_denied`, `mfa_phone_wrong_number`; and `log_security_event` for each sign-in outcome like the passkey path. Verify every action name against the audit `action` column length first.
- `reset_all_factors` and `manage.py reset_user_mfa` also remove pairings and live requests and revoke refresh tokens (`remove_all`). A user cannot remove their last factor if `required_source(user)` is set (a paired phone counts only through its passkey, which already counts).
- `webauthn.verify_assertion` is split so the signature, origin and counter checks live in one function used by both the login path and the phone path. No copy of that logic.

Push: `send_push_notification(user, title, message, url=None, endpoints=None)` gains an optional `endpoints` filter (default `None` = unchanged behaviour). The approval push goes only to paired phones' endpoints, through the existing `is_push_service_url` check.

Settings: `PHONE_APPROVAL_ENABLED` (dev default true, production default false until the rollout step in the runbook). `config/settings_production.py` refuses to boot when it is true and the `WEBAUTHN_*` settings are unset (pinned in `config/test_deployment.py`). The approval URL base is the first entry of `WEBAUTHN_ORIGINS`.

## 4. Frontend

- `frontend/src/services/phoneApprovalService.ts`: request, collect, fetch request, decide, pair, list, rename, remove (base URL follows the `/auth/...` convention, no doubled `api/`).
- `AuthContext`: `completePhoneApproval(mfaToken, requestId, collectKey)`; ends in `startSession` like the passkey path.
- `LoginPage`: when `methods` has `phone`, "Approve on my phone" is the primary action and the existing options sit below it. The phone step shows the number large, "Check your phone", a "Show QR code instead" toggle and "Use a code instead". It polls every 2 s with a chained timeout that stops on unmount, on `denied`, on `expired` (never a dead end: the code field is offered) and after the 120 s window.
- New public route `/phone-approve/:requestId` (`PhoneApprovePage`, outside the shells): shows who is signing in from which browser and when, the three numbers, then the biometric prompt through the existing `getAssertion`. Success says "Approved. Go back to your computer." It never signs the phone in.
- Settings Security block: `PairedPhonesSection` ("Use this phone to approve sign-ins"): creates a passkey on this device (existing `registerPasskey`), asks for the notification permission through the **existing** push-subscription hook (no second subscribe path), then pairs. List with rename and remove behind the step-up dialog. Hidden when the switch is off.
- Copy never says "TL"; errors state what, why, how. No `prompt()`/`confirm()`. Every control labelled, 320 px layout, light and dark.

## 5. Test strategy (TDD, red first)

Backend: `apps/users/tests_app/test_phone_approval_service.py`, `test_phone_approval_auth.py`, `test_phone_pairing.py`, reusing the `cryptography` test authenticator from the passkey tests. Cases: happy path push and QR; wrong number; denied; expired; replayed decision; second collect after consume; collect without the key; collect with another user's request; assertion from an unpaired passkey; assertion from another user's passkey; assertion for another request's challenge; UV flag missing; lockout shared with TOTP; 4th live request refused; maintenance on; switch off (404, no `phone` method); no token row before approval. Query budgets pinned for `login_challenge` and `status_for`, a user with no phone unchanged.

Frontend (vitest): service, `LoginPage` phone step (poll, deny, expire, fall back to code), `PhoneApprovePage` (wrong tap, cancel, success), Settings section.

E2E (Playwright): two browser contexts. The "PC" signs in with the password and requests approval via QR; the "phone" context (Chromium CDP virtual authenticator, passkey registered and paired first) opens `approve_url`, taps the number, approves; the PC context lands signed in. Desktop and 393 px projects. Push delivery itself cannot be simulated; it is covered by a unit test of the payload and by the manual check in the runbook.

## 6. Site Backup (important for maintenance)

Decision: both tables are **excluded** from Site Backup, like `usermfa`, `webauthncredential` and `webauthnchallenge`. A pairing is a second-factor credential (a restore must not revive a removed phone) and a request is live state. They travel only through the database dump on a server move.

- Add `users.pairedphone` and `users.phoneloginrequest` to `EXCLUDED_MODELS` (`plugins/site_backup/services/backup.py`).
- `test_backup.py` asserts both labels are absent from `dumpable_model_labels()` and from the dependency graph.
- New guard in `test_backup_coverage_guard.py`: **every model defined in `apps/users/models/mfa.py` is excluded**, so the next second-factor table fails the suite until someone decides on purpose.
- `docs/site-backup-and-restore.md` table row for second-factor data lists the two tables; item 55's standing rule and item 90 say a new factor table is excluded by default.
- Restore behaviour unchanged: a restore never touches these tables; deleting a user through `delete_missing_models` cascades the pairing away, which is intended.
- Neither model has a `pre_save`/`post_save` receiver, so no `raw=True` guard is needed; a test pins that none is added without one.

## 7. Documentation and maintenance

- `docs/workflow-invariants.md`: new item 90 with the rules above and the future-change checklist; item 89 gets "push approval reversed by item 90".
- `CLAUDE.md`: Hot Invariant line and a Task Router row (`phone approval, push approval, QR sign-in, paired phone`).
- `docs/deploy/production-runbook.md`: new 5.9 (rollout: enable the switch, check VAPID and `check_webauthn_config`, pair one phone, test push and QR, rollback = switch off); 5.8 cross-link. `docs/deploy/server-migration-checklist.md`: pairings travel with the database; the hostname and the VAPID keys must stay. `.env.example` and production env docs: `PHONE_APPROVAL_ENABLED`.
- `docs/site-backup-and-restore.md` as in section 6. A short handover note in `docs/handover/`.

Future-change checklist (in item 90): a new way to obtain a session honours `login_challenge`; a new factor table is excluded from backup and listed in `HOUSEKEEPING_MODELS`; a new `UserViewSet` credential action joins the `IsAdminUser` list; the push provider list or VAPID keys change, re-run the runbook 5.9 check; watch `mfa_phone_wrong_number` in the audit log (a spike is someone approving blind or an attacker with a password).

## 8. Risks and honest limits

- Approving a request you did not start still signs an attacker in. Number matching, the requester summary, the 120 s window and the audit trail reduce this; they do not remove it. Said plainly in the approval page copy.
- iPhone push needs the app installed to the Home Screen (iOS 16.4 or later); the QR path covers the rest. Android Chrome needs no install.
- A phone without internet cannot approve; the code and the browser's own passkey prompt remain.

## 9. Review focus (inputs the happy path misses)

1. Approval URL forwarded or screenshotted: useless without the PC's `collect_key` and a paired passkey.
2. User removes the passkey while a request is live: the request can no longer be approved (credential gone), the PC shows expired.
3. Two PCs sign the same user in at once: separate requests, numbers and keys; approving one never completes the other.
4. Clock skew or a phone opened after expiry: clear "expired, start again", never a 500.
5. Push endpoint gone (410) or plugin disabled: the PC still gets `pushed: false` and the QR code.

## 10. Implementation notes (2026-11-19)

Decisions taken while building, recorded here so the spec matches the code:
- `collect(user, public_id, collect_key, *, consume=True)`: the view first peeks with `consume=False`, so the maintenance check runs before an approval is spent; only `_complete_mfa_login` consumes.
- Extra error code `request_invalid` (404) for an unknown, malformed or foreign request id and for a wrong `collect_key`, so nothing is revealed. Also `phone_exists` (409) for pairing the same passkey twice.
- `status_for` adds `phone_approval: true` and `phones: [...]` only while the switch is on (absent, not false, when off), so the payload is unchanged.
- Switch off answers 404 through `NotFound` in `initial()` of every phone view, not the 503 of `unavailable`.
- The PC poll has its own throttle scope `phone_poll` (240/min); the `mfa` scope (10/min) would 429 a 2-second poll.
- `qr_svg` is always returned so the PC can toggle the QR without another request.
- The bulk-delete per-user query budget moved from 205 to 210 on purpose (two more relations to `User`).
- `PHONE_APPROVAL_ENABLED` is documented in the runbook and the migration checklist; `.env.example` could not be edited from the session (blocked by a read/edit deny rule), so the owner adds one line there.
