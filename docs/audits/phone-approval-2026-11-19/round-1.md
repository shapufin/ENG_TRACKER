# Phone approval sign-in: audit round 1 (2026-11-19)

Scope: PR #344 (feature) and PR #350 (compose passthrough, notification setup guide). HEAD audited: `d62e2428`.

## Findings

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | `docker-compose.yml` did not pass `PHONE_APPROVAL_ENABLED` to `backend` and `scheduler`; a value in `.env` never reached the container and the feature stayed off silently, while runbook 5.9 said it was passed through | HIGH | Fixed in #350; pinned by `config/test_deployment.py::SchedulerFoundationContractTests.test_phone_approval_switch_reaches_the_backend_and_scheduler`; the `Deploy config` CI check validated the compose file |
| 2 | Handover wording implied the switch costs nothing in both states | LOW | Fixed in #350 (off: no query; on: one `exists()` per password login) |
| 3 | Notification setup guide was not described in item 90, runbook 5.9 or the handover | LOW | Fixed in this PR |
| 4 | `frontend/e2e/phone-approval.spec.ts` needs the 3.14 `python` shim and free ports 5173/8000 | LOW | Documented in the spec header and the handover |

## Verified

- Everything is merged and pushed: no open PRs, no remote branches left, `git diff origin/main` of the audited files is empty.
- Local gates before merge: `config.test_deployment` 96 OK, vitest settings/login/approve pages 126 OK, `tsc`, eslint, prettier clean.
- Full backend 5257 OK and frontend 694 files OK on the #344 head; Playwright `phone-approval.spec.ts` 6/6 serial on #344.

## Not covered / backlog

- The setup guide was not click-tested in a browser (other dev servers held ports 5173 and 8000); vitest covers tabs, toggle and auto-open.
- Real push delivery needs one manual check on Android and one on iPhone (runbook 5.9).
- `main` Frontend CI was red before this work on two `fallow dead-code` findings that are not from this feature: `ticket_kpi/components/CategoryPieChart.tsx` (unused file) and `UserLeaveSummary` in `LeaveUserGroupedTable.tsx` (unused type export). Both removed afterwards in a dead-code cleanup (the file had no importers; the type is only used inside its file).
- Owner ruling 2026-11-19: a password change keeps paired phones (sessions are revoked, pairings are not). Not covered by a test yet; the owner tests it before relying on it.

## Scorecard

Round 1: 1 HIGH, 3 LOW. Fixed: 4 of 4. False positives: 0. New: 0.
