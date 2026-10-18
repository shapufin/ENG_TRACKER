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
10. **Every plugin API view uses `PluginPermissionMixin`** (it enforces the runtime-disable refusal and the plugin grants). `apps/plugins/test_plugin_view_guard.py` fails on a view without it; an exemption needs a one-line reason in its `EXEMPT` set.
11. **A plugin with its own bulk scope query must prove parity with core.** `engagement` keeps a fixed-query-count `_managed_map`; `plugins/engagement/test_core_scope_parity.py` pins it to `get_team_member_ids()` (intended differences: leader excluded, inactive users dropped).
12. **A declared grant must gate something.** `PluginPermissionMixin` falls back to the HTTP method (GET -> `view`, others -> `manage`) for any `@action` missing from `permission_action_map`. If a plugin declares `export` or `configure`, map every export/configure action to it explicitly, or revoking the grant in Resource Access silently does nothing (skills exports were like this until 2026-10-18; `plugins/skills/tests/test_export_grant.py`).
