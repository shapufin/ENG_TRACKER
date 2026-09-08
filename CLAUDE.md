# Engineering Tracker — Claude Overlay

Senior full-stack engineer for a Django + React codebase. Preserve
permissions, business-day leave, calendar privacy, OT/standby monthly
lock, and `PayrollRunEntry` invariants. Prefer TDD. Keep diffs minimal.

## Read Before Coding

Match the user request to a context file in the router below and load it
before writing code. If the task touches permissions, OT/standby/leave,
calendar, or plugins, also read the linked domain file.

## Task Router — Keyword → On-Demand Context

| Keywords | Load | Why |
|---|---|---|
| permission, role, auth, access, group, TL scope | `.devin/context/01-PERMISSIONS.md` | Most complex system; easy to break |
| model, field, migration, queryset, schema | `.devin/context/02-DATA-MODELS.md` | Entity relationships before queries |
| component, hook, page, context, React, frontend test | `.devin/context/03-FRONTEND-PATTERNS.md` | Composition + test conventions |
| screenshot, fingerprint, visual verify/diff, UI refactor verification | `.devin/context/12-VISUAL-VERIFICATION.md` | Fingerprint capture + diff tooling |
| endpoint, serializer, ViewSet, API, URL, service | `.devin/context/04-API-PATTERNS.md` | DRF + service layer patterns |
| add feature, new page, new endpoint, end-to-end | `.devin/context/05-COMMON-TASKS.md` | Step-by-step recipes |
| overtime, standby, leave, balance, MonthlyLock, carryover | `.devin/context/06-DOMAIN-INVARIANTS.md` | Domain rules that must not break |
| payroll, wage, payslip, gross-to-net | `.devin/context/PLUGINS/01-payroll.md` | Payroll lifecycle invariants |
| control room, CR, standby projection | `.devin/context/PLUGINS/02-control-room.md` | CR scoping rules |
| ticket, KPI, evidence upload | `.devin/context/PLUGINS/03-ticket-kpi.md` | Ticket KPI invariants |
| skills, proficiency, matrix, gap report, skill rating | `.devin/context/PLUGINS/04-skills.md` | Skills plugin invariants |
| organigrama, org chart, Tech grouping | `.devin/context/PLUGINS/05-organigrama.md` | Live chart + builder invariants |
| calendar, workspace, workspace_users | `.devin/context/07-CALENDAR.md` | Calendar privacy + workspace rules |
| chart, Recharts, analytics visualization | `.devin/context/08-ANALYTICS-VISUALIZATION.md` | Chart sizing + data-source rules |
| plugin permission, render surface, resource access | `.devin/context/09-RESOURCE-ACCESS.md` + `.devin/context/10-PLUGIN-PERMISSIONS.md` | Group grants + plugin gates |
| file location, where is, find file | `.devin/context/PROJECT_INDEX.md` | Directory inventory |
| plan, create plan, megaplan, optimize plan | `.devin/context/11-PLAN-CREATION.md` | Senior plan protocol: zero-hallucination specs + self-correcting gates |
| past bug, session history, what changed | `AGENTS.md` (recent) + `.devin/tracking/agents-archive-*.md` | Session logs |
| cross-stack impact, blast radius, call graph, type hierarchy | trace-mcp MCP server (`get_change_impact`, `get_call_graph`) | Precomputed graph — use instead of 10 grep/read calls |

## Hot Invariants

- **Permissions** — multi-role users are normal. Pure-HR write block uses
  `is_hr_only()`. TL scope is `get_team_member_ids()`. Never ORM-filter
  removed `profile__is_team_leader` or `profile__team` columns.
- **CR-scoped UI** — CR-only users/admins have no My Clients or notification
  preferences in Settings, and the Organigrama sidebar injection is hidden.
  Multi-role CR identities retain their higher-role behavior.
- **Business-day leave** — use `count_business_days` for validation,
  deduction, reports, insights, and exports. Field names are `request_type`
  and `reason`. There is no `LeaveType` model.
- **Team member resolution** — `get_team_member_ids()` combines direct
  `italian_tl`/`albanian_tl` FK + shared `TeamMembership` M2M + `led_teams`.
  Use it for every TL approval, filter, or visibility check.
- **Calendar invariants** — team calendars must be created with
  `is_public=False`. Use `useValidWorkspaceIds`, never raw
  `selectedWorkspaceIds`. `calendar_group` shares *workspaces*, not users.
  `get_users_for_workspace()` returns only the workspace's own team members.
- **OT/standby monthly lock** — `MonthlyLockMixin` blocks owner updates
  and deletes in past months. Non-pending locked records are superuser-
  delete only; pending bypass the lock. Frontend `deleteLog` must append
  `?ignore_date_filter=true`; `canDelete` = `isSuperuser || !isPastMonth`.
- **PayrollRunEntry guard** — `OvertimeLogViewSet`/`StandbyLogViewSet`
  `perform_destroy` return 400 if `PayrollRunEntry` references the record.
  Superuser override deletes of non-pending locked records are audit-logged.
- **Skills Matrix** — read `.devin/context/PLUGINS/04-skills.md` before
  touching the plugin. Preserve public `view` access with queryset/object
  scoping, TL scope via `get_team_member_ids()`, and use matrix
  `user_skill_id` (not `skill_id`) for rate mutations.
- **Frontend plugin service URLs** — axios `baseURL` is
  `http://127.0.0.1:8000/api`. Plugin services must use
  `BASE = "/plugins/<name>"`, NOT `"/api/plugins/<name>"` (doubled
  `api/` → 404). Tests mock the API layer and don't validate URL paths.
- **Removed plugins / dead code** — do not reference: `budget`,
  `email_notifications`, `export` plugins; `EmailTemplate`,
  `EmailNotificationRule`, `send_notification_email`,
  `trigger_notification_rule`, `send_upload_reminders`, `upload_reminder`;
  `UserViewSet.import_users`; `manual_export_check.py`;
  `Skill.display_order` / `SkillCategory.display_order` (removed in
  migration `0005`; ordering is A-Z by `name` only).

## Skill Triggers

| Task | Skill |
|---|---|
| Any implementation or bugfix | `test-driven-development` |
| Backend query/perf change | `django-perf-review` |
| Auth/permission/input change | `security-review` |
| Code review requested | `review` |

## Verification Commands

Run focused checks while iterating. Run full suites exactly once after the
implementation is complete.

### Iteration — targeted only

```bash
# Backend
python manage.py test apps.<app>.tests.<test_name>
python manage.py check
python -m ruff check apps core config plugins --output-format=concise

# Frontend
npx vitest run src/<path>
npx tsc -b --noEmit
npx eslint src/<path>
npx prettier --check src/<path>
```

### Final verification — once before completion

```bash
# Backend
python manage.py test
python manage.py makemigrations --check

# Frontend
npx vitest run
npm run build

# Code health when the change affects structure
npx fallow dead-code
npx fallow dupes
```

## Claude Code Session Guidelines

- **Targeted output**: use quiet/concise flags (`-q`,
  `--output-format=concise`); inspect only relevant output ranges.
- **Focused reads**: use targeted search and specific file ranges, not
  whole-repository reads.
- **Iterative testing**: focused tests while developing; full suite once
  after implementation.
- **Session boundary**: one feature/bug/PR per session; no stale context
  carried forward.

## Maintenance — Keep This File in Sync with `.devin/`

`.devin/` is the authoritative context system; this overlay is a
Claude-optimized lens. When a `.devin/` file changes, mirror only the
delta: (1) update the router table row, (2) update the affected Hot
Invariant. Do not copy full contents from `.devin/`. Keep under 200
lines. `validate-state.ps1 -Event Manual` is the cross-tool validator.
