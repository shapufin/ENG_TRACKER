# Phone Approval Sign-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user approves a Windows sign-in with Face ID or fingerprint on a paired phone (push first, QR fallback), as one more second factor beside TOTP and passkeys.

**Architecture:** A `PhoneLoginRequest` row (Postgres) is created after the password step. The phone proves it with a WebAuthn assertion from a paired passkey bound to that request's challenge plus a number-match tap; the PC polls with a secret key and ends in the existing `_complete_mfa_login`. Push goes through the existing Web Push service via a lazy, plugin-safe import.

**Tech Stack:** Django 6 + DRF, `webauthn` (already pinned), pywebpush (notifications plugin), React 19 + TypeScript, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-19-phone-approval-login-design.md` (read it first; section numbers below refer to it).

## Global Constraints

- Branch: this worktree branch, off `main`. One PR, squash. Never commit or push unless the owner asks: every "Commit" step below runs only after the owner has said to commit (otherwise leave the work staged-free in the tree). Use `py -3.14` for Django commands; quiet flags; targeted tests while iterating, the full pass once (Task 16).
- TDD: failing test first, watch it fail, then implement.
- `apps/users` never imports `plugins.notifications` statically: lazy import inside `try/except ImportError` only (CLAUDE.md "Plugin removal safety").
- Decision state in Postgres, never Redis. No soft delete on the new models. No `window.location` redefinition in vitest (mock `@/lib/pageNavigation`).
- Every session path ends in `_signed_in_response` (via `_complete_mfa_login`); no code mints tokens elsewhere.
- Frontend: axios baseURL already ends in `/api`, so services use `/auth/...`. Colours from tone tokens, text >= 12px, no `prompt()/confirm()/alert()`, never "TL" in copy.
- Phone approval OFF (`PHONE_APPROVAL_ENABLED=false`) must leave every existing response, `methods` list and query count unchanged.
- Update the docs listed in Task 15; a new factor table is excluded from Site Backup by default.

## Review Focus

1. Approval link forwarded or screenshotted: cannot sign anyone in without the PC's `collect_key` and a paired passkey (Task 5, Task 9 tests).
2. Passkey removed while a request is live: request cannot be approved, PC sees expired (Task 5).
3. Two PCs for one user at once: independent requests, one approval never completes the other (Task 9).
4. Phone opened after expiry, or request id unknown: clear error, never a 500 (Task 8, Task 11).
5. Push endpoint 410 or plugin disabled: `pushed: false` and the QR still works (Task 5, Task 7).

---

### Task 1: Settings, kill switch and production guard

**Files:**
- Modify: `config/settings.py`, `config/settings_production.py`, `.env.example`
- Test: `config/test_deployment.py`

**Interfaces:**
- Produces: `settings.PHONE_APPROVAL_ENABLED: bool` (env `PHONE_APPROVAL_ENABLED`; dev default `True`, production default `False`).

- [ ] **Step 1: Failing tests** in `config/test_deployment.py` (follow the existing `MFA_ENCRYPTION_KEYS` / `WEBAUTHN_*` guard tests): `test_phone_approval_defaults_off_in_production`, `test_production_refuses_phone_approval_without_webauthn_settings` (enabled + `WEBAUTHN_RP_ID` unset raises the same boot error type as the passkey guard), `test_phone_approval_on_with_webauthn_settings_boots`.
- [ ] **Step 2:** `py -3.14 manage.py test config.test_deployment -k phone` fails.
- [ ] **Step 3:** Add the setting and guard; copy the shape of the existing WEBAUTHN guard; add the variable with a comment to `.env.example`.
- [ ] **Step 4:** Same command passes. Commit `feat(auth): phone approval kill switch`.

### Task 2: Models, migration, user-delete housekeeping

**Files:**
- Modify: `apps/users/models/mfa.py`, `apps/users/models/__init__.py`, `apps/users/services/user_deletion.py` (add `'users.PairedPhone'`, `'users.PhoneLoginRequest'` to `HOUSEKEEPING_MODELS`)
- Create: next migration in `apps/users/migrations/`
- Test: `apps/users/tests_app/test_phone_models.py`

**Interfaces:**
- Produces: `PairedPhone`, `PhoneLoginRequest` exactly as spec section 2 (field names verbatim; constants `PhoneLoginRequest.STATUS_PENDING|APPROVED|DENIED`, `PHONE_REQUEST_TTL_SECONDS = 120` in the service later).

- [ ] **Step 1: Failing tests:** `test_removing_a_passkey_removes_its_pairing`; `test_credential_pairs_once` (second `PairedPhone` for the same credential raises `IntegrityError`); `test_user_delete_is_not_blocked_by_pairings_or_requests` (create both rows, `user_delete_blockers(user)` is empty); `test_public_id_is_unique_uuid`.
- [ ] **Step 2:** Run them; expect import errors.
- [ ] **Step 3:** Add the models in `mfa.py` (docstring: same reasoning as the other factor models: plain rows, no soft delete). `py -3.14 manage.py makemigrations users`, then `py -3.14 manage.py migrate`; confirm `showmigrations users` has no `[ ]`.
- [ ] **Step 4:** Tests pass; `py -3.14 manage.py makemigrations --check` clean. Commit.

### Task 3: Site Backup exclusion and the guard against forgetting

**Files:**
- Modify: `plugins/site_backup/services/backup.py` (`EXCLUDED_MODELS` += `'users.pairedphone'`, `'users.phoneloginrequest'`), `plugins/site_backup/tests/test_backup.py`, `plugins/site_backup/tests/test_backup_coverage_guard.py`
- Modify: `docs/site-backup-and-restore.md` (second-factor row names both tables)

- [ ] **Step 1: Failing tests:** in `test_backup.py` extend the existing label and dependency-graph assertions (lines ~66-73) to both new labels; in the guard add `test_every_second_factor_model_is_excluded_from_backup`: iterate `django_apps.get_app_config('users').get_models()` whose `__module__ == 'apps.users.models.mfa'` and assert `is_excluded(model)`; add `test_second_factor_models_have_no_save_receivers` asserting no `post_save`/`pre_save` receiver is registered for the two new models (a future receiver must add the `raw=True` guard on purpose).
- [ ] **Step 2:** `py -3.14 manage.py test plugins.site_backup.tests.test_backup plugins.site_backup.tests.test_backup_coverage_guard` fails on the new assertions.
- [ ] **Step 3:** Add the two labels to `EXCLUDED_MODELS`; update the docs row.
- [ ] **Step 4:** Both modules pass, including the full round-trip test in the guard (proves a backup and restore still work with the new tables present). Commit.

### Task 4: One shared assertion verifier (no behaviour change)

**Files:**
- Modify: `apps/users/services/webauthn.py`
- Test: existing `apps/users/tests_app/test_webauthn_service.py`, `test_webauthn_auth.py` (safety net, must stay green unchanged)

**Interfaces:**
- Produces: `verify_assertion_for_challenge(user, response: dict, challenge: bytes, *, require_paired: bool = False) -> WebAuthnCredential` doing origin, RP ID, user-verification, signature, sign-count regression (`mfa_passkey_clone_suspected`) and `last_used_at`. `verify_assertion(user, response)` becomes: consume the login challenge, then call it. `require_paired=True` also demands `credential.paired_phone` exists, else `MFAError('no_phone', ...)`.

- [ ] **Step 1:** Add `test_verify_assertion_for_challenge_matches_login_behaviour` (same fixture, direct call) and `test_require_paired_refuses_unpaired_passkey`; run them red.
- [ ] **Step 2:** Extract the body of `verify_assertion` (currently lines ~213-262) into the new function; keep failure counting (`_record_failure`) and lock checks exactly where they are.
- [ ] **Step 3:** Run the two existing webauthn modules plus the new tests: all green. Commit `refactor(auth): share assertion verification`.

### Task 5: Phone approval service

**Files:**
- Create: `apps/users/services/phone_approval.py`
- Test: `apps/users/tests_app/test_phone_approval_service.py`

**Interfaces:**
- Consumes: Task 2 models, Task 4 `verify_assertion_for_challenge`, `mfa.make_challenge/read_challenge`, `mfa.qr_svg`, `webauthn._lock_row/_record_failure` (reuse, do not copy).
- Produces:
  - `phone_approval_enabled() -> bool` (setting and `webauthn.is_available()`).
  - `request_approval(user, via: str, ip: str | None, agent: str) -> dict` returns `{request_id (str uuid), number (int), collect_key (str), expires_in (int), pushed (bool), qr_svg (str), approve_url (str)}`; raises `MFAError('no_phone')` without a pairing, `MFAError('too_many_requests')` at 3 live requests, `locked` when locked.
  - `approval_view(public_id: str) -> dict` returns `{options: list[int], requester: {agent, ip, at}, username, assertion: dict, expires_in}`; `MFAError('request_expired'|'request_used')`.
  - `decide(public_id: str, decision: str, number: int | None = None, response: dict | None = None) -> None`.
  - `collect(user, public_id: str, collect_key: str) -> str`.
  - Private `_push_to_phones(user, request) -> bool` using a lazy `from plugins.notifications.push_service import send_push_notification` inside `try/except ImportError` returning `False`; payload url is `approve_url`.

- [ ] **Step 1: Failing tests** (names; each asserts the stated outcome with the `cryptography` test authenticator from the passkey tests):
  - `test_request_creates_pending_row_with_digest_not_key` (DB holds `sha256(collect_key)`, never the key).
  - `test_request_without_paired_phone_is_refused`; `test_fourth_live_request_is_refused`; `test_expired_rows_are_pruned_on_create`.
  - `test_approve_with_right_number_and_valid_assertion_marks_approved`.
  - `test_wrong_number_denies_and_counts_a_failure_toward_the_shared_lock`.
  - `test_assertion_for_another_requests_challenge_is_refused`; `test_unpaired_passkey_is_refused`; `test_other_users_passkey_is_refused`; `test_missing_user_verification_is_refused`.
  - `test_decision_cannot_be_replayed`; `test_expired_request_cannot_be_decided`; `test_removed_passkey_means_request_cannot_be_approved` (Review Focus 2).
  - `test_collect_pending_then_approved_consumes_once` (second collect raises `request_used`); `test_collect_with_wrong_key_is_refused_and_does_not_consume`; `test_collect_for_another_users_request_is_refused`.
  - `test_push_failure_or_missing_plugin_still_returns_qr` (patch the lazy import to raise `ImportError` and to return `(0, 1)`; `pushed` is `False`, `qr_svg` set) (Review Focus 5).
  - `test_no_token_row_exists_before_approval` (no `OutstandingToken` for the user).
- [ ] **Step 2:** Run the module; all fail.
- [ ] **Step 3:** Implement. Choices fixed by the spec: number 10-99 with two distinct decoys in the same range, `options` shuffled; `challenge = secrets.token_bytes(32)`; `collect_key = secrets.token_urlsafe(32)`; compare digests with `hmac.compare_digest`; lock the request row with `select_for_update` inside `transaction.atomic` for `decide` and `collect`; `approve_url = f"{WEBAUTHN_ORIGINS[0]}/phone-approve/{public_id}"`.
- [ ] **Step 4:** Module passes. Commit.

### Task 6: Pairing service

**Files:**
- Create: pairing functions in `apps/users/services/phone_approval.py` (same module, separate section) or `apps/users/services/phone_pairing.py` if the module passes ~300 lines
- Test: `apps/users/tests_app/test_phone_pairing.py`

**Interfaces:**
- Produces: `pair(user, credential_pk: int, name: str, push_endpoint: str = "") -> PairedPhone`, `list_phones(user) -> list[dict]` (`id, name, last_used_at, can_push`), `rename(user, phone_id, name)`, `remove(user, phone_id)`, `remove_all(user)`. Step-up (`mfa.check_step_up`) is the view's job, as for passkeys.

- [ ] **Step 1: Failing tests:** `test_pair_own_passkey`; `test_cannot_pair_another_users_passkey` (404-style `MFAError('not_found')`); `test_pair_twice_is_a_clear_conflict` (`credential_exists`-style 409 code); `test_push_endpoint_must_be_a_stored_subscription_of_the_user_and_a_push_service_url` (else stored blank, flow still pairs as QR only); `test_rename_and_remove_are_owner_only`; `test_remove_all_deletes_pairings_and_live_requests`.
- [ ] **Step 2:** Red. **Step 3:** Implement; validate the endpoint with the same lazy `is_push_service_url` import and an ownership check against the user's `PushSubscription` rows (lazy import; `ImportError` means blank endpoint). **Step 4:** Green. Commit.

### Task 7: Plugin-safe push filter

**Files:**
- Modify: `plugins/notifications/push_service.py` (`send_push_notification(user, title, message, url=None, endpoints=None)`)
- Test: `plugins/notifications/test_push_endpoints_filter.py`

- [ ] **Step 1: Failing tests:** `test_endpoints_none_sends_to_every_active_subscription` (existing behaviour pinned); `test_endpoints_filter_sends_only_to_listed_endpoints`; `test_filtered_send_still_rejects_non_push_service_urls`.
- [ ] **Step 2:** Red; **Step 3:** add the optional parameter, filter the queryset by `endpoint__in=endpoints` when given; keep every existing guard. **Step 4:** Run `py -3.14 manage.py test plugins.notifications` green (existing `test_push*.py` must not change). Commit.

### Task 8: Login integration, views, URLs, audit

**Files:**
- Modify: `apps/users/services/mfa.py` (`_methods`, `status_for`, `reset_all_factors` calls `phone_approval.remove_all`), `apps/users/views/auth.py`, `config/urls.py`, `apps/users/services/user_deletion.py` untouched here
- Test: `apps/users/tests_app/test_phone_approval_auth.py`, update `apps/permissions/test_row_ownership_matrix.py` as it dictates, query-budget tests that pin `login_challenge`/`status_for`

**Interfaces:**
- Produces views and URL names: `PhoneRequestView` (`phone_request`), `PhoneCollectView` (`phone_collect`), `PhoneApprovalDetailView` (`phone_approval_detail`), `PhoneApprovalDecideView` (`phone_approval_decide`), `PairedPhonesView`/`PairedPhoneDetailView` (`mfa_phones`, `mfa_phone_detail`), routes exactly as the spec table. Sign-in views extend `_MFAView`; `phone-collect` calls `_complete_mfa_login` only when `collect()` returns `'approved'`, otherwise answers `202 {status}` without a security-log failure entry.

- [ ] **Step 1: Failing tests:** `test_methods_include_phone_only_with_pairing_switch_and_webauthn` and `test_payload_is_unchanged_without_a_pairing` (equality with the pre-change payload; also with the switch off); `test_full_flow_issues_tokens_only_after_approval` (password, request, 202 pending, phone approve, collect gives cookie and access token, `LOGIN_SUCCESS` with `auth_method='phone'`); `test_status_reports_phone_approval_flag_and_paired_phones` (`status_for` gains `phone_approval: bool` and `phones: list`, both absent-safe for the Settings section in Task 13); `test_switch_off_returns_404_on_every_phone_endpoint`; `test_maintenance_blocks_request_decision_and_collect`; `test_deny_ends_the_request_and_pc_sees_denied`; `test_unknown_or_malformed_request_id_is_404_not_500` (Review Focus 4); `test_pairing_endpoints_need_step_up`; `test_reset_user_mfa_removes_pairings_and_revokes_tokens`; query budgets for `login_challenge` and `status_for` (one extra `exists()`/query, pinned on purpose, zero extra when the switch is off).
- [ ] **Step 2:** Red. **Step 3:** Implement. First verify the audit `action` column max length and pick names from spec section 3 that fit (`mfa_phone_paired`, `mfa_phone_removed`, `mfa_phone_approved`, `mfa_phone_denied`, `mfa_phone_wrong_number`); shorten consistently and record the final names in item 90 if any changes. Register routes beside the passkey ones in `config/urls.py`. Add the new view classes to the permission matrix/`IsAdminUser` lists only if the matrix test demands it.
- [ ] **Step 4:** New module plus `apps.users`, `apps.permissions` suites green. Commit.

### Task 9: Adversarial end-to-end backend tests

**Files:** Test: `apps/users/tests_app/test_phone_approval_adversarial.py`

- [ ] **Step 1: Write tests, run them (they should pass if Tasks 5-8 are right; any failure is a bug to fix there):** `test_forwarded_approval_url_without_collect_key_cannot_sign_in`; `test_two_pcs_two_requests_are_independent` (Review Focus 3); `test_three_blind_approvals_lock_the_account` (shared lock with TOTP); `test_changed_password_voids_pending_mfa_token_so_collect_fails`; `test_phone_endpoints_are_throttled_with_the_mfa_scope`; a source-walk `test_only_complete_mfa_login_mints_tokens_for_phone` (no new `issue(` caller).
- [ ] **Step 2:** Fix defects found with a regression test first. Commit.

### Task 10: Frontend service and AuthContext

**Files:**
- Create: `frontend/src/services/phoneApprovalService.ts`, `phoneApprovalService.test.ts`
- Modify: `frontend/src/context/AuthContext.tsx` (+ its tests)

**Interfaces:**
- Produces: `requestPhoneApproval(mfaToken: string, via: "push" | "qr")`, `collectPhoneApproval(mfaToken, requestId, collectKey): Promise<AuthResponse | { status: "pending" | "denied" | "expired" }>`, `getApprovalRequest(requestId)`, `decideApproval(requestId, body)`, `listPhones()`, `pairPhone(body)`, `renamePhone(id, name)`, `removePhone(id, stepUp)`. `AuthContext.completePhoneApproval(mfaToken, requestId, collectKey)` returns the status object for non-final answers and calls `startSession` on success.

- [ ] **Step 1: Failing vitest tests:** URLs and bodies for each call (mock the API layer; assert paths start with `/auth/` and never `/api/`); `completePhoneApproval` calls `startSession` only on a real sign-in response.
- [ ] **Step 2-4:** Red, implement, green (`cd frontend; npx vitest run src/services/phoneApprovalService.test.ts src/context`). Commit.

### Task 11: Approval page on the phone

**Files:**
- Create: `frontend/src/pages/PhoneApprovePage.tsx`, `PhoneApprovePage.test.tsx`
- Modify: the router file that declares public routes (find it with trace `search` for the `/login` route), `frontend/src/services/passkeyService.ts` only if `getAssertion` needs exporting

- [ ] **Step 1: Failing tests:** shows requester browser and time and three number buttons; tapping the wrong number is sent as chosen and the page shows "Denied, nothing was approved"; right number then `getAssertion` then `decideApproval` called with `{decision:"approve", number, response}`; cancelled prompt shows a retry, no request sent; expired and unknown request show "This request expired. Start again on your computer." with no stack trace; "Not me" sends `deny`. No navigation or session on success.
- [ ] **Step 2-4:** Red, implement (route `/phone-approve/:requestId`, public, outside `AppShell`/`AdminShell`), green. Commit.

### Task 12: Login page phone step

**Files:**
- Modify: `frontend/src/pages/LoginPage.tsx`; Create: `frontend/src/pages/LoginPage.phone.test.tsx`

- [ ] **Step 1: Failing tests:** `methods` with `phone` shows "Approve on my phone" first and the other options below; no `phone` in `methods` renders exactly as before (existing `LoginPage.*` tests unchanged and green); click requests push, shows the number and "Check your phone"; polling every 2 s with fake timers stops on unmount, `denied`, `expired` and after 120 s, each landing on the code field with a clear message; "Show QR code instead" renders the `qr_svg` the way the TOTP setup renders its QR (reuse that component or pattern); `pushed: false` auto-shows the QR; success calls `completePhoneApproval` result into the session.
- [ ] **Step 2-4:** Red, implement (new `Step` value `"phone"`, chained `setTimeout`, cleanup in the effect), green. Commit.

### Task 13: Settings pairing section

**Files:**
- Create: `frontend/src/pages/settings/components/PairedPhonesSection.tsx`, `.test.tsx`
- Modify: the Security block in `SettingsPage.tsx`, beside `PasskeysSection`

- [ ] **Step 1: Failing tests:** hidden when status shows the switch off (add `phone_approval: boolean` to the MFA status payload in Task 8 if not already present and test it there); pairing creates a passkey on this device via `registerPasskey`, obtains the notification permission and current subscription through the **existing** push hook (locate it with trace `search` "pushManager.subscribe"; add no second subscribe path), then calls `pairPhone`; denied notification permission still pairs as QR only with a visible note; list shows name, last used, "push on/off"; rename and remove go through the existing step-up dialog.
- [ ] **Step 2-4:** Red, implement, green; run eslint on the changed files. Commit.

### Task 14: Playwright end to end (the click-through gate)

**Files:**
- Create: `frontend/e2e/phone-approval.spec.ts`

- [ ] **Step 1:** Two contexts. "Phone": Chromium CDP virtual authenticator (UV and resident key on), sign in, register a passkey, pair it from Settings (no push in e2e, so QR only), sign out. "PC": password step, "Approve on my phone", QR path, read `approve_url` from the page; "Phone" opens it, taps the number shown on the PC page, approves; assert "PC" lands signed in. Second test: wrong number leaves the PC on an error with the code field offered. Third: PC without a pairing sees no phone option.
- [ ] **Step 2:** Follow the e2e runbook in CLAUDE.md: delete `db.e2e.sqlite3`, `migrate` and `prepare_e2e_db` with `config.settings_e2e` first; run this file alone on desktop and the 393 px project. Never edit the spec mid-run. Expected: all pass; keep screenshots of the PC step, the phone page and Settings (light and dark) as evidence.
- [ ] **Step 3:** Commit.

### Task 15: Documentation and workflow

**Files:**
- Modify: `docs/workflow-invariants.md` (confirm item 89 is the last, add item 90; add a pointer line in item 89; add one sentence to item 55's standing rule: a new second-factor table is excluded from backup by default and named in the guard), `CLAUDE.md` (one Hot Invariant bullet and a Task Router row with keywords `phone approval, push approval, QR sign-in, paired phone, PairedPhone, PhoneLoginRequest`), `docs/deploy/production-runbook.md` (new 5.9, link from 5.8), `docs/deploy/server-migration-checklist.md`, `docs/site-backup-and-restore.md` (done in Task 3, re-check), `.env.example` (done in Task 1)
- Create: `docs/handover/2026-11-19-phone-approval-login.md` (what shipped, rollout order, rollback, open risks from spec section 8)

- [ ] **Step 1:** Write the docs from spec sections 3, 6, 7, 8, including the future-change checklist and the `mfa_phone_wrong_number` watch item. Runbook 5.9 steps: confirm VAPID keys and `check_webauthn_config --production`; set `PHONE_APPROVAL_ENABLED=true`; pair one phone; test push on Android and iPhone (home-screen install) and the QR path; rollback = switch off, no migration to revert.
- [ ] **Step 2: Verify references:** `git grep -n "phone_approval\|PairedPhone\|item 90" docs CLAUDE.md` shows every named file, command, setting and model exists; `git grep -n "PHONE_APPROVAL_ENABLED" config .env.example docs` lists all places. Commit.

### Task 16: Quality gates and hand-off

- [ ] **Step 1: Full pass once:** `py -3.14 manage.py makemigrations --check; py -3.14 manage.py test`; `python -m ruff check --output-format=concise <changed .py files>`; `cd frontend; npx tsc --noEmit; npx vitest run; npm run build`; plus the standing simulation gates named in CLAUDE.md (unchanged, must stay green). Expected: zero failures.
- [ ] **Step 2: Reviews:** `security-review` on `phone_approval.py` and the new views (replay, origin, challenge binding, collect key, lockout, fail-closed), `django-perf-review` on `login_challenge`/`status_for`, `code-review` on the diff. Fix findings with a regression test first.
- [ ] **Step 3: Frontend gate** (docs/workflow-invariants.md): the Task 14 pass is the click-through; also run `node scripts/control-audit.mjs` and `node scripts/surface-audit.mjs` (strict as in CLAUDE.md) and the modal audit if a dialog was added.
- [ ] **Step 4:** `graphify update .`. Open the PR from this branch (squash). Do not merge until the owner says so; the switch stays off in production until runbook 5.9 is done.

---

## Self-review notes

- Spec coverage: models (T2), backup (T3), shared verifier (T4), service rules incl. number match, collect key, three-live-requests, push lazy import (T5, T7), pairing (T6), methods/status/reset/audit/maintenance/endpoints (T8), adversarial cases (T9), frontend (T10-T13), e2e (T14), docs and workflow (T15), gates (T16), kill switch and production guard (T1).
- Types consistent: `request_approval`, `collect`, `decide`, `approval_view` signatures in T5 are what T8 views and T10 service call; field names follow spec section 2 everywhere.
- Deliberately open, to settle while coding: the final audit action names (T8 checks the column length), the migration number (T2 uses `makemigrations`), and the exact router file and push hook names (found with trace `search`, not guessed).
