# Workflow invariants (shared, tracked)

This file is the tracked home for project rules that agents must keep when
they change payroll, overtime, standby, leave, notifications, or the e2e
environment. `.devin/context/` is local-only (`.gitignore`), so anything a
future maintainer or agent must know lives here. Keep this file short and
update it in the same PR as the behaviour change.

Last verified: 2026-10-21 (launch review baseline, `py -3.14 manage.py test` → OK, count in the review register).

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
Counted days are never the calendar span. Vacation uses `count_leave_days` /
`count_request_days` (`apps/leave_management/models/core.py`): Monday to Friday minus
global public holidays (`PublicHoliday.calendar IS NULL`); sick leave uses plain
`count_business_days`. Workspace-only holidays never reduce a balance. A request freezes
its count in `days_counted`, and reports read the snapshot (`counted_days`) so totals match
what the balance moved. Pinned by `apps/leave_management/test_leave_days.py`.

Year-end carry-over (`apps/leave_management/services/carry_over.py`,
`apply_year_end_carry_over`): a closed year's unused vacation becomes a carry row that
expires on the settings date (default 31 March of the next year); pending days count as
reserved and are not carried twice; days released later in a closed year flow back into that
year's carry row. Pinned by `test_carry_over.py` and, for cost, `test_carry_over_query_budget.py`.
Plan: `docs/superpowers/plans/2026-10-13-leave-carryover-and-holidays.md`.

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
- Accounts (11, from `seed_e2e_data`): `e2e_employee_a`, `e2e_employee_b`, `e2e_employee_c` (Albanian TL only, a seed gap), `e2e_tl` (Italian), `e2e_tl_b` (Albanian), `e2e_tl_hr`, `e2e_hr`, `e2e_admin`, `e2e_super`, `e2e_cr` (Control Room), `e2e_hbpr`.
- TL close: `/team/approvals`, button "Finalize <Month YYYY>". Run page: `/admin/payroll/runs/<id>`. Finalize stays disabled until the status reads "All TL scopes closed".
- Before writing scratch data, confirm the database: `netstat -ano` for port 8000, and `settings.DATABASES['default']['NAME']`. A server started without `settings_e2e` writes to `db.sqlite3`.
- Clean up only rows you created, matched by id and description.
- **Playwright reuses whatever already listens on 5173/8000** (`reuseExistingServer`). From a second checkout or worktree that means you silently test the other checkout's code. Before capturing, check who owns the ports (`Get-NetTCPConnection -LocalPort 5173,8000 -State Listen`, then the process command line). To test a worktree, run its own backend on another port with `settings_e2e`, and start Vite on another port with `VITE_API_URL=http://127.0.0.1:<backend port>/api` (the API base URL is absolute, so a Vite proxy override is ignored). Use `127.0.0.1`, not `localhost`, for the backend (Django binds IPv4).
- The non-e2e dev backend throttles `/api/auth/token/` hard (a dozen logins locks it out for 10-20 minutes, and probes count). Log in once per role per test and reuse the page; never log in per screenshot.

## Browser automation (CloakBrowser / Playwright MCP)

- `browser_find` needs `text` or `regex`. An empty call errors and returns the whole tool list.
- `browser_type` takes `target` (the snapshot ref), not `ref`.
- Refs go stale after any click or navigation. Take a fresh snapshot before the next action.
- A bottom install banner or a top status aside can intercept clicks. Dismiss it first.

## Team confidentiality (2026-10-20)

Ruling: "Team members don't see statuses of other team members; that is part of the TL's confidentiality. They can see vacation and so on, which is related to their work." Employees are self-only for statuses, pending counts, approval queues and per-person aggregates; only the team leave calendar is shared. TL = own team via `get_team_member_ids()`; HR/staff unchanged; TL names are not confidential, counts are (`/users/teams/` masks `members_count`/`sub_teams_count` except for staff, HR and that team's TL). `italian_team_leaders`/`albanian_team_leaders` are staff, HR and TL only: employees, HBPR-only and CR-only get 403, and employees learn TL names from the org chart and `/users/teams/`. A test that pins employees seeing teammates' statuses is a bug. Enforced by `apps/permissions/test_row_ownership_matrix.py`, `apps/dashboard/tests/test_widget_team_scope.py`, `apps/users/tests_app/test_tl_directory_scope.py`.

## Plugin audit checklist (run when touching or reviewing any plugin)

Derived from the 2026-10-18 `ticket_kpi` audit. Each line is a defect class that was found there.

1. **Core never references a plugin.** `grep -rn "plugins\.<name>" apps config` must be empty (migrations excepted). `ticket_kpi` enforces this with `test_core_coupling.CoreDoesNotImportKpiTests`; copy that test for a new plugin. A plugin may register its own OpenAPI enum name in its `apps.py ready()`, never in `config/settings.py`. Core-wide guard: `apps/plugins/test_core_plugin_isolation.py` fails on an unguarded module-level plugin import, on any import not in its `ALLOWED_IMPORTS` list (add a line only together with a fail-closed `except ImportError` fallback), and on any `plugins.*` string in `config/`.
2. **Team scope = `UserProfile.get_team_member_ids()`.** Never rebuild a TL scope with ORM filters (`profile__teams__team_leader`, FK checks). KPI had a private copy that missed shared-team members. Pinned by `TeamScopeParityTests`.
3. **One normalizer / one helper.** If a plugin needs core logic (ticket reference normalization, business days), import it; do not copy the regex. KPI's `normalize_ticket_id` is core's `normalize_ticket_reference`.
4. **Update paths authorize the OLD object, not only the new target.** A `perform_update` that repoints a FK must check the current owner as well as the new one (`LinkRepointTests`).
5. **Every nav link a plugin owns carries `pluginName`** (`useVisibleNavItems` and `useAdminNavItems`); AppShell passes `activePluginNames`. Otherwise disabling the plugin leaves dead links.
6. **No dead config.** Every key in `get_config_schema()` must be read somewhere; `PluginConfigTests` fails on a declared-but-unused key.
7. **Signal receivers and the code that decides the same thing must agree** (e.g. delete-signal "other batch exists" must filter `is_overridden=False` like `compute_monthly_kpi`).
8. **Signals connect in `plugin.py ready()` and disconnect in `disable()`**, never in `apps.py`.
9. **Core tests do not import plugin models.** Put the plugin's own checks in the plugin's tests.
10. **Every plugin API view carries `PluginEnabledMixin`** (the runtime-disable refusal). `PluginPermissionMixin` includes it and adds the plugin grants; a self-service view with no grants (the notification inbox, `my-records`) uses `PluginEnabledMixin` alone. `apps/plugins/test_plugin_view_guard.py` scans `viewsets*` modules of every plugin and fails on a view without it; there is no exemption list.
11. **A plugin with its own bulk scope query must prove parity with core.** `engagement` keeps a fixed-query-count `_managed_map`; `plugins/engagement/test_core_scope_parity.py` pins it to `get_team_member_ids()` (intended differences: leader excluded, inactive users dropped).
12. **A declared grant must gate something.** `PluginPermissionMixin` falls back to the HTTP method (GET -> `view`, others -> `manage`) for any `@action` missing from `permission_action_map`. If a plugin declares `export` or `configure`, map every export/configure action to it explicitly, or revoking the grant in Resource Access silently does nothing (skills exports were like this until 2026-10-18; `plugins/skills/tests/test_export_grant.py`).
13. **A plugin that imports another plugin at module level must survive its absence.** `data_import` auto-imports every importer module, several of which import `skills`/`control_room`/`payroll`; `import_importer_module` skips a module whose missing import is another plugin and still fails loudly for anything else.
14. **Plugin URLs are mounted for every discovered plugin at boot, from the filesystem, never from the database** (`apps/plugins/urls.py` uses `get_all_plugins()`; pinned by `apps/plugins/test_static_plugin_routes.py`). Enabling a plugin in the admin UI makes its API answer with no restart, and a database that is down at boot cannot drop routes. Whether a plugin answers is decided per request by item 10 (403 when disabled). `apps/plugins/apps.py ready()` still reads the enabled set once at boot to connect signals, so signals of a plugin enabled later connect in the activating worker immediately and in the others when they recycle. Older tests that call `_ensure_analytics_urls()`-style setup are no longer needed. Parallel runs now pass (about 40s vs about 170s serial).

## Business calendar day

15. **"What day is it" comes from `business_today()`, never the server clock.** `TIME_ZONE` is UTC, so `date.today()`, naive `datetime.now()`, `timezone.localdate()` and `timezone.now().date()` return the previous day for the first 1-2 hours of each business day. Use `core.utils.timezone_local.business_today()` / `business_tz()` (zone = `GlobalSettings.business_timezone`, default `Europe/Tirane`, cached and cleared on save). Do not call `timezone.activate` (it would silently change `TruncDate`/`__date` grouping). `core/test_business_today_guard.py` fails on a new offender; an exemption needs a reason in its `ALLOWED` map. Tests pin the day with `core.utils.clock_testing.freeze_business_today`, and a test that changes the zone must `addCleanup(clear_business_tz_cache)` (rollback fires no signals).
16. **A retention setting needs an enforcer, and deletion is opt-in.** `audit_log` `retention_days` is enforced by `purge_audit_logs --if-configured` (runs at boot, no-op unless an admin set the value); `AnalyticsConfiguration.data_retention_days` by `purge_analytics_data` (manual or cron; daily buckets are never purged because live trends read them). Never add a boot-time delete that runs on defaults.
17. **Retention commands are the only deleters, and each is bounded.** `prune_notifications` (read notifications older than 180 days, batched, unread kept, runs at boot), `purge_audit_logs --if-configured`, `purge_analytics_data` and `purge_hbpr_archive` delete in bulk; their query counts do not grow with row count (`plugins/notifications/test_pagination_prune.py`, `plugins/audit_log/test_purge_query_budget.py`, `plugins/analytics/test_purge_analytics_data.py`, `apps/users/tests_app/test_hbpr_assignments.py`). There is no scheduler: boot runs the first three, `purge_analytics_data` needs the cron in `docs/deploy/production-runbook.md` section 5.4.
18. **A plugin disabled at runtime refuses its API for everyone, staff included.** `PluginEnabledMixin` (inherited by `PluginPermissionMixin`) raises `PermissionDenied` when the `Plugin` row says `is_enabled=False` (`plugins/payroll/tests/test_disabled_plugin_gate.py`); `apps/plugins/test_plugin_view_guard.py` fails on a plugin view without the mixin. Code that reaches another plugin's data must treat "disabled" like "absent" (`payroll_plugin_disabled()`, `except ImportError` only).
19. **A team's Italian and Albanian TL are derived from its members, not stored.** `TeamSerializer.italian_tl` / `albanian_tl` show the TL most active members share (ties to the lowest id, inactive members do not vote) in two queries per list; `Team.team_leader` and `led_teams` scope are untouched, so derivation never widens access. Pinned by `apps/users/tests_app/test_team_derived_tls.py` (including `test_list_query_count_does_not_grow_with_teams`).
20. **Holiday sync runs from the boot path, not from `ready()`.** `manage.py sync_payroll_holidays` (in `docker/entrypoint.sh`) copies Payroll-only holidays to HR and mirrors HR ones back; it uses `get_or_create`, so two workers cannot race into an `IntegrityError` (`apps/dashboard/tests/test_holiday_sync.py::test_sync_survives_another_worker_creating_the_same_holiday`, `::test_boot_command_runs_the_sync`).
21. **Employee code (`UserProfile.code`, 2026-10-21).** Optional, unique **case-insensitively** (a `Lower('code')` `UniqueConstraint` with `code IS NOT NULL`, so any number of profiles may have none), trimmed, and a blank is stored as `NULL`, never `''` (`UserProfile.save()`). Every writer goes through `normalize_employee_code` / `validate_employee_code` in `apps/users/services/user_creation.py`, which raises `UserValidationError('code', ...)` so the form shows it inline; the importer reports a taken code as a row error and never uses a code to pick a *different* username's row (identity stays username, then email). Exposed on `UserProfileSerializer`, the OT/standby/leave `user_code`, the TL-scorecard `TeamMemberSummary.code`, and as the **last** column of the OT/standby, leave and payroll sheets, because consumers read those sheets by position (never insert a column mid-sheet). Deliberately NOT on `UserSerializer`: it is nested into `TeamSerializer.team_leader` and other employee-visible payloads. `resolve_user` falls back to the code, but an importer only sees `code` if it declares the field, and most still require `username`; do not claim an importer accepts a code until its `get_fields()` lists it. Pinned by `apps/users/tests_app/test_employee_code.py`, `plugins/data_import/test_employee_code_import.py`.
22. **Verify a plan against the code before building it.** The employee-code plan (`.devin/plans/plan-employee-code-field-2026-10-21.md`) had to be corrected on: the next migration number (it said 0022, the tree was at 0019), a redundant triple index on one column, case-sensitive uniqueness, "all importers benefit automatically" (false: `mapped_row` only carries declared fields), importer code-matching that could rewrite another person's row, a field added to a serializer that is nested into employee-visible payloads, and record serializers with no consumer. Check migration numbers with `git ls-files <app>/migrations`, the consumers of a serializer with `find_usages`, and positional consumers of a spreadsheet before changing its columns.
23. **Overtime paid blocks (2026-10-24).** Timed overtime entries of one person on one day that start inside the same paid hour share it. A block opens at the first entry's start and is paid for one hour; an entry that starts inside shares it, work past the end extends it by whole hours, and an entry starting at or after the end opens a new block (`apps/overtime/paid_blocks.py`, `compute_blocks`). `OvertimeLog.hours` is the entry's **paid share**, so payroll, analytics and dashboards read it unchanged; `paid_window_start/end` hold the block. `recalculate_day` runs from `OvertimeLog.save()` (any save that touches status, times, date, user or hours, so approve, edit-back-to-pending, importers and bulk approve are covered) and from `post_delete`. Inside a block every paid hour is shared by the entries that worked in it, in proportion to the minutes each worked there (`Block.exact_hours`), so an entry running a minute past the hour carries the extra hour (08:00-08:30 plus 08:40-09:01 is 0.5h and 1.5h) and two short entries split one hour. Approved entries share the hours of the blocks built from **approved entries only** (a pending sibling never changes pay); pending entries show the share they would get. An entry already in a **finalized** `PayrollRunEntry` is frozen at the hours payroll paid (`frozen_log_hours` reads `PayrollRunEntry.hours`, and a full `save()` of a paid entry restores them; its window is never rewritten) and a later sibling gets only what is left of the block, so a finalized month is never reopened and nothing is paid twice. A draft whose shares changed refuses to finalize (existing `hours != entry.hours` guard in `_finalize_run_entries`, so Regenerate). Entries typed as plain hours have no times and stay outside blocks. Shares are quarter hours, hundredths when more entries than quarters; the API `hours` is a float, not an int, and the overtime CSV export writes `format_hours` (`core/utils/hours.py`: 4 -> `4`, 0.5 -> `0.5`), never `int()`. `recalculate_day` must run inside a transaction (it locks the day's rows); a timed bulk approve costs about 11.5 queries per row (`test_bulk_query_budget.py`). Known limit: entries after midnight are dated the next day and open their own block. Payroll exports list one row per block with every worked time range and reference: Excel sheet "Overtime Entries" (last sheet, other sheets are read by position) and the "Overtime Entries" table on the payslip and consolidated PDF (`_overtime_block_rows`). **Standby is unchanged** (static hours). **TL/HR Excel (the one that is emailed):** `bundle_paid_blocks` (`apps/reports/services/export_service.py`) merges overtime rows of one block into one row (whole hours, first start to last end, evidence and references joined), keeping the columns; standby, plain-hours entries and rows in different statuses, payroll periods or settlements stay separate, except that a 0h entry (added after its hour was paid) joins the paid row of its block in the same payroll period, so the emailed file never shows a bare 0h line. Carried-over entries belong to the next month's export (`date_mode=processing_period`). The overtime CSV export stays one row per record. **Form preview:** `GET /overtime/logs/preview/` (`paid_blocks.preview_share`) tells the form what an entry would be paid, so "Hours (auto-calculated)" shows the share and the block instead of the single-entry figure. Pinned by `apps/reports/test_paid_block_bundling.py`, `apps/overtime/test_paid_blocks.py`, `plugins/payroll/tests/test_overtime_blocks.py`, `frontend/src/pages/overtime/components/OvertimeHoursBadge.test.tsx`.
