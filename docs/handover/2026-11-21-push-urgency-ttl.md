# Handover: Web Push urgency and TTL (2026-11-21)

Rules: `docs/workflow-invariants.md` item 90 (d). Related: `docs/handover/2026-11-19-phone-approval-login.md`,
`docs/deploy/production-runbook.md` 5.9.

## Problem

A phone-approval notification did not appear while the phone was asleep or the browser was in the
background; it arrived only after Chrome (or the installed app) was opened. The push request carried
neither `Urgency` (RFC 8030 §5.3) nor a TTL (RFC 8030 §5.2), and `pywebpush` defaults to `ttl=0` with
normal urgency, so FCM/APNs/Mozilla queued or batched the alert under Android Doze and iOS power
management.

## Change

- `plugins/notifications/push_service.py`: `send_push_notification(..., ttl=DEFAULT_PUSH_TTL_SECONDS,
  urgency="high")` now forwards `ttl=` and `headers={"Urgency": urgency}` to `webpush(...)`.
  `DEFAULT_PUSH_TTL_SECONDS = 300`.
- `apps/users/services/phone_approval.py`: `_push_to_phones` sends `ttl=PHONE_REQUEST_TTL_SECONDS` (120 s)
  and `urgency='high'`, so the alert is queued for exactly as long as the request is valid.
- `frontend/src/pages/settings/components/PushSetupGuide.tsx`: Android tab gained the battery/background-data
  step (Chrome -> Battery -> Unrestricted; allow background data), since aggressive OEM battery management
  can still hold a browser's background traffic even with high urgency.

## Tests

- `plugins/notifications/test_push_resilience.py`: default `ttl`/`Urgency` assertions and a custom
  `ttl`/`urgency` forwarding test.
- `apps/users/tests_app/test_phone_approval_service.py`: the approval push carries the request TTL and
  high urgency.

## Verification

- `py -3.14 manage.py test plugins.notifications apps.users.tests_app.test_phone_approval_service apps.users.tests_app.test_phone_approval_auth`
  -> 203 OK.
- `npx vitest run src/pages/settings/components/PushSetupGuide.test.tsx` -> 4 passed.
- `ruff check` clean on the touched Python files; `npx tsc -b` clean; `eslint` and `prettier --check` clean
  on the touched frontend files; `npm run build` OK.

## Deploy note

Backend only: rebuild or restart the `backend` container (`docker restart engineering-tracker-backend-1`
or `docker compose up -d backend`). No migration, no environment variable, no frontend-only deploy needed
for the push behaviour.

Real delivery is still not covered by an automated test (no push service in e2e): confirm once on an
Android phone with the screen locked and once on an iPhone with the app on the Home Screen.
