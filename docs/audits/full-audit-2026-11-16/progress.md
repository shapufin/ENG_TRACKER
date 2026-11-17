# Full audit 2026-11-16: implementation progress

Source: `handover-full-audit-2026-11-16.md` (repo root, untracked; HEAD `6ea27d0`). Branch `fix/audit-2026-11-16`.
Method: every finding is re-read in the code first, then test first (red), then the smallest fix (green).
No subagents. Nothing is committed until the owner asks.

## Owner decisions (defaults used, change on request)

| Id | Question | Used | Why |
|---|---|---|---|
| D1 | May a rejected leave request be approved again? | Yes, but through the same overlap and balance checks as creation | `LeaveBalanceTransitionTests` pins reject then approve as a feature; the audit's smallest fix keeps it |
| D2 | Recount leave days on a new holiday automatically? | Not decided, M4 not started | Time-critical, needs the owner before mid-December |
| D3 | 1-on-1 backlog action, whole-month leave KPI | Not decided, R3/R7 untouched | Product ruling |
| D4 | Logo may be public | Yes (phase 3) | Already shown on the public login page |

## Phases

| Phase | Items | Status |
|---|---|---|
| 1 | H2 push URL allow-list, H1 refresh failure, M8 test-mode argv | Done, targeted tests green |
| 2 | H3 re-approval guard, H4 push ownership (backend + logout) | Done, targeted tests green |
| 3 | M1 logo, M2 scheduled reports (+L6), M5 scheduler watchdog, M3 slot horizon (+R1) | Done, targeted tests green. R2 deferred (see below) |
| Later | M6, section 5 lows, handover section 7 | Not started, needs decisions or its own piece of work |

## Phase 1 and 2 detail

- **H2** `is_push_service_url` in `plugins/notifications/push_service.py` (exact https hosts: FCM, Mozilla, WNS, Apple; extend with `PUSH_ENDPOINT_EXTRA_HOSTS`). Checked in `subscribe` (400) and before every send (stored bad rows are skipped and deactivated). `keys` must be an object of strings, `endpoint` at most 500 characters. Tests: `test_push_endpoint_guard.py`. Resilience-test fixtures moved from `push.example.test` to an FCM host.
- **H4** backend: `subscribe` deactivates the same endpoint for other users; `account_signals.deactivate_push_subscriptions` deactivates a user's rows when `is_active` turns false. Frontend: `authService.logout` releases the browser subscription (best effort). Tests: `test_push_ownership.py`, `authService.test.ts`.
- **H1** `isAuthRejection` (401/403 only) in `frontend/src/lib/api.ts`; refresh call has a 10 s timeout; transient failures keep session and offline queue; `AuthContext` bootstrap uses the same rule. Tests: `api.refreshFailure.test.ts`, `AuthContext.maintenance.test.tsx`.
  - **Deferred:** the "ask before manual logout with a non-empty queue" dialog (three call sites: `AppShell`, `AdminShell`, `SettingsPage`). It needs a click-through in a browser, which was not available.
- **H3** `perform_approve`: approving an approved request is a no-op (approver and time kept); approving a rejected one runs `_ensure_no_overlap` and `_validate_vacation_request` first (400). Bulk approve selects pending rows only, so it is unaffected. Tests: `test_reapproval_guard.py`.
- **M8** `_IS_TESTING` reads `sys.argv[1]` only. Test: `ProductionSettingsHardeningTests.test_a_command_argument_named_test_does_not_switch_on_test_mode`.

## Phase 3 detail

- **M1** `config/views.py`: `branding/` is a `public` rule, decided before the auth check; other prefixes unchanged. Tests: `config/test_media.py` (anonymous reads the logo, nothing else). Confirm on production: open the login page with a custom logo and read the network tab.
- **M2 + L6** `plugins/analytics/scheduled_reports.py` (`run_due_reports`, `next_run_after`), plugin job `analytics.reports` hourly; the command and `run_now` share the next-run rule. Row lock with `skip_locked`; SQLite ignores locks, so "sent once" is proven by the second tick sending nothing, not by threads.
- **M5** `Scheduler.stuck_job`, `Heartbeat(stuck=, on_stuck=)`; `SCHEDULER_JOB_TIMEOUT` default 1800 s. `EMAIL_TIMEOUT`, DB `connect_timeout` and `lock_timeout` in `settings_production.py`. The DB option syntax is standard libpq passed through psycopg and is pinned by a settings test, but was not run against a live PostgreSQL here: check it in the CI PostgreSQL job.
- **M3 + R1** `next_due_slot(max_days=)`; `one_on_one._is_linked`. Limit: a leave longer than the 366-day look-ahead still ends the search at the horizon.
- **R2 deferred:** deleting a plan inside `record_leader_link_change` would make `apps/users` import the tl_scorecard plugin (forbidden by plugin removal safety). Needs a signal or a plugin-side hook.

## Phase 4

- **M7** `PushSubscription.failure_count` (migration `0012`), `PUSH_MAX_FAILURES = 5` in `push_service.py`: a timeout or connection error counts, the fifth consecutive one deactivates the row, a success resets it. 404/410 still deactivates at once. Tests: `test_push_resilience.py`. Delivery from a scheduler job (handover section 7 item 5) is still open.

- **M4 (D2 = automatic, owner leaned to it 2026-11-17)** `holiday_recount.py` + `PublicHoliday` save/delete receivers recount open future vacation and balances; `recount_leave_days` command (dry run default); `reserve_vacation_days` extracted from the viewset so creation and recount share it. `ensure_calendar_covers_holidays` in `generate_draft_run`. Tests: `apps/leave_management/test_holiday_recount.py`, `plugins/payroll/tests/test_holiday_guard.py`; `test_auto_lifecycle` now seeds the calendar. Employees are not notified of the recount (the leave audit rows record it). **Open:** admin notice from 1 November, runbook year-start checklist.

- **M9** daily retention jobs moved into the scheduler (notifications, audit_log, analytics plugins; core token flush via `CORE_JOBS`), entrypoint comments and runbook job table corrected (now lists every job). Test: `apps/plugins/test_housekeeping_jobs.py`.

- **M4 follow-up** `plugins/payroll` `check_year_start --year` (read-only checklist) and a runbook year-start checklist replace the admin notice; the in-app notice is not built (needs a browser pass).

## Phase 5 (2026-11-17, branch feat/team-tab-log-meeting)

- **Team tab** row-level "Log meeting" button, "Set recurring 1-on-1" wording (see workflow-invariants item 84). Browser click-through done with the e2e spec on desktop and mobile, plus a desktop screenshot.
- **R2** `leader_link_changed` signal + `plugins/tl_scorecard/leader_moves.py`. **R4** month-end clamp. **R6** booleans. **L1** log formatter. **L2** `year` 400. **L5** overtime update row lock. **R5** not real (no `is_deleted` on `Meeting`).
- Left: R3 and R7 (owner decision D3), L3 (decide soft-delete guard), L4 (measure first), L7 (vitest pool), L8 (owner deletes scratch files), L9 (lock file), M6 (PostgreSQL job), logout confirm dialog, in-app M4 notice, rotating log files (L1 second half: drop or mount `logs/`).

## Phase 6 (2026-11-17, owner rulings D3 and L1/L3)

R3 skip-all-overdue, R7 whole-month leave, L1 stdout-only logs, L3 guard test, L4 measured and pinned, L7 vmThreads, H1 logout confirm, M4 weekly notice (`year_start` job), M6 `lock_person` + PostgreSQL-only race test. Details: workflow-invariants item 87 (k)-(s). **Not verified here:** the PostgreSQL race test (skipped on SQLite) runs only in CI `backend-postgres`; no browser pass on the logout dialog or the skip-all checkbox (unit-tested only). **Left:** L9 lock file (runbook recipe, needs the Linux 3.12 image), L8 scratch files (owner).

## Verification on 2026-11-17 (before merge)

Backend 4,882 tests, frontend 4,393 with coverage, a 5-seed balance reconciliation walk (also found and fixed: editing a rejected leave request left phantom pending days) and a year-rollover simulation all pass. Full desktop e2e: 7 of the 9 spec files that failed in the batch pass in isolation (shared seeded data between files). **Correction (2026-11-17, later):** the two `role-workflows.spec.ts` failures (B visibility, E team views) were NOT bugs: a long-lived `db.e2e.sqlite3` had kept Line Manager links written by earlier specs (HBPR reassign), so TL B legitimately saw Team A. On a rebuilt e2e database the whole file passes (37 passed). Rule: delete `db.e2e.sqlite3`, run `migrate` and `prepare_e2e_db` (settings_e2e) before a full e2e run; specs that change links do not restore them.

## Still open (not started)

M6 (PostgreSQL-only concurrency test), R3 to R7, section 5 lows (L1 to L9), handover section 7. Docs synced: `docs/workflow-invariants.md` item 87, `CLAUDE.md` hot invariant, runbook 5.4.

## Not verified

Browser, e2e and visual gates were not run (no browser in this session). H1 and H4 frontend behaviour is covered by unit tests only; run the offline e2e flow and a two-account push check before release.
