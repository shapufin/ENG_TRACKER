# Handover: phone approval sign-in (2026-11-19)

Spec `docs/superpowers/specs/2026-11-19-phone-approval-login-design.md`, plan
`docs/superpowers/plans/2026-11-19-phone-approval-login.md`, rules in `docs/workflow-invariants.md` item 90,
rollout in `docs/deploy/production-runbook.md` 5.9.

## What shipped

A user on a PC clicks "Approve on my phone" after the password. A paired phone gets a push (QR code as the
fallback), the user taps the number shown on the PC and confirms with a fingerprint or face (a WebAuthn
assertion of a paired passkey, bound to that one request). The PC polls with a secret key and signs in through
the existing `_complete_mfa_login`.

- Backend: `apps/users/services/phone_approval.py`, `phone_pairing.py`, views and routes in
  `apps/users/views/auth.py` and `config/urls.py`, models `PairedPhone` and `PhoneLoginRequest` (migration
  `users.0031_phone_approval`), shared assertion check `webauthn.verify_assertion_for_challenge`,
  `send_push_notification(..., endpoints=)` in the notifications plugin.
- Frontend: `PhoneApprovePage` (public route `/phone-approve/:requestId`), the LoginPage `phone` step with
  `PhoneApprovalWait`, Settings `PairedPhonesSection` with `PushSetupGuide` (iPhone/Android steps to turn on
  notifications), `phoneApprovalService`, `AuthContext.completePhoneApproval`.
- Site Backup: both tables excluded; the guard fails for any new model in `apps/users/models/mfa.py` that is
  not excluded, and for save receivers added to the two models without a `raw=True` guard.
- Tests: `apps/users/tests_app/test_phone_*.py`, `test_webauthn_shared_verify.py`,
  `plugins/notifications/test_push_endpoints_filter.py`, frontend vitest files named `*phone*`/`PhoneApprove*`/
  `PairedPhones*`, and the Playwright spec `frontend/e2e/phone-approval.spec.ts` (two browser contexts, virtual
  authenticator, QR path).

## Rollout order

Production default is OFF. Follow runbook 5.9: passkeys working, VAPID keys set, `PHONE_APPROVAL_ENABLED=true`,
pair one phone, test push and QR, tell users. Rollback: switch off, no migration to revert.

## Open risks and limits

- Approving a request you did not start still signs an attacker in (number matching, requester summary and the
  120 s window reduce it).
- iPhone push needs the app on the Home Screen (iOS 16.4 or later). Real push delivery is not covered by an
  automated test (no push service in e2e): check it by hand once on Android and once on iPhone.
- `.env.example` needs one line for `PHONE_APPROVAL_ENABLED` if it does not have it yet (it could not be edited from the build session).
- Query cost: switch off = no extra query; switch on = exactly one extra `PairedPhone.exists()` per password login, paired or not. The pinned test is the source of truth, do not "optimise" it away.
- The PC does not push on its own: after the password the user clicks "Approve on my phone" (a deliberate no-surprise-push rule); change that only as a design decision.
- Running `frontend/e2e/phone-approval.spec.ts` needs the 3.14 `python` shim on PATH (it shells out to `python manage.py reset_user_mfa`), like `passkeys.spec.ts` (e2e runbook).
- Open for the owner: whether a pairing should also be revoked when the user's password is changed (today the
  password change revokes sessions but pairings stay; the passkey is the credential).
