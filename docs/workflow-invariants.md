# Workflow invariants (shared, tracked)

This file is the tracked home for project rules that agents must keep when
they change payroll, overtime, standby, leave, notifications, or the e2e
environment. `.devin/context/` is local-only (`.gitignore`), so anything a
future maintainer or agent must know lives here. Keep this file short and
update it in the same PR as the behaviour change.

Last verified: 2026-10-12 (full suite `py -3.14 manage.py test` → 2737 OK).

## Test gate

- Full suite: `py -3.14 manage.py test`. Run `py -3.14 manage.py makemigrations --check` first.
- Ruff on every changed Python file.
- Focused runs: `py -3.14 manage.py test apps.<app>` or `apps.<app>.tests.<Class>`.

## Month cutoff (overtime and standby)

- Work date in month M is accepted only before 00:00 on the 2nd of M+1, Europe/Tirane (`apps/users/services/approval_periods.py`: `work_date_cutoff`, `is_work_date_open`, `assert_work_date_open`).
- Enforced on create for every user, staff and superusers included, with HTTP 400. On update the check runs only when `date` changes.
- Current-month dates are never blocked.
- Error text says "the 2nd of the following month" (fixed 2026-10-12; it previously said the 1st).

## Approval transitions (overtime and standby)

- `perform_approve` and `perform_reject` act only on `pending` entries.
- Any other status returns HTTP 400 with the current status. It is never a silent 200.
- Bulk approve and reject already filter to `pending`.
- Test: `apps/overtime/test_status_transitions.py`.
- Self-approval by a TL is intentional and must stay allowed.

## Leave balances

`LeaveRequestViewSet.perform_approve` and `perform_reject` move `days_requested`
between `LeaveBalance.pending_days` and `used_days` by transition:

| From → To | Effect |
|---|---|
| pending → approved | pending −, used + |
| rejected → approved | used + |
| pending → rejected | pending − |
| approved → rejected | used − (balance restored) |
| approved → approved | no change |

Test: `apps/leave_management/tests.py::LeaveBalanceTransitionTests`.
Counts always use `count_business_days`, never calendar span.

## Notification delivery (`plugins/notifications/signals.py`)

- Submission: the employee gets `own_*_submitted`; the TL gets `team_action_required` (link `/team/approvals`).
- Status change: the employee gets `own_*_updated` (success on approve, warning on reject).
- Delivery follows each recipient's `NotificationPreference`. An employee who turned off in-app `own_leave_updated` will not see leave decisions. That is their setting, not a fault.
- To verify a flow: take the `Notification` ids before and after the action, then read `GET /api/plugins/notifications/notifications/` and `unread_count/` as the recipient.

## Payroll and TL closure

- `PayrollConfiguration.require_tl_closed_before_finalize` defaults ON (migration `0011_require_tl_closed_default_on`, 2026-10-12, which also sets the existing singleton row).
- Finalize is blocked until every employee on the run has a TL-closed approval period for that month. Draft runs in open months are affected.
- Tests that finalize runs unrelated to the gate must set the flag to False in `setUpTestData`. Gate tests set it explicitly.
- An employee with only an Albanian TL can be closed by that TL, because Italian and Albanian TLs share finalize permission. Business rule: every employee should still have at least one Italian TL.

## E2E environment

- Start the backend with `DJANGO_SETTINGS_MODULE=config.settings_e2e`. It writes to `db.e2e.sqlite3`.
- Seed with `migrate`, `seed_e2e_data` and `seed_payroll_rules`, then give each paid employee a `WageAssignment` (payroll skips users without one).
- Password for all seeded accounts: `e2e_pass_2026`.
- Accounts: `e2e_employee_a`, `e2e_employee_c` (Albanian TL only, a seed gap), `e2e_tl` (Italian), `e2e_tl_b` (Albanian), `e2e_hr`, `e2e_admin`.
- TL close: `/team/approvals`, button "Finalize <Month YYYY>". Run page: `/admin/payroll/runs/<id>`. Finalize stays disabled until the status reads "All TL scopes closed".
- Before writing scratch data, confirm the database: `netstat -ano` for port 8000, and `settings.DATABASES['default']['NAME']`. A server started without `settings_e2e` writes to `db.sqlite3`.
- Clean up only rows you created, matched by id and description.

## Browser automation (CloakBrowser / Playwright MCP)

- `browser_find` needs `text` or `regex`. An empty call errors and returns the whole tool list.
- `browser_type` takes `target` (the snapshot ref), not `ref`.
- Refs go stale after any click or navigation. Take a fresh snapshot before the next action.
- A bottom install banner or a top status aside can intercept clicks. Dismiss it first.
