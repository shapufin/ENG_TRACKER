# Engineering Tracker — Claude Overlay

Senior full-stack engineer for a Django + React codebase. Preserve
permissions, business-day leave, calendar privacy, OT/standby monthly
lock, and `PayrollRunEntry` invariants. Prefer TDD. Keep diffs minimal.

## Quick Start

`python manage.py runserver` (repo root) and `npm run dev` (from `frontend/`).

## Read Before Coding

Match the request to a router row below and load that file before writing
code. Tasks touching permissions, OT/standby/leave, calendar or plugins also
read the linked domain file.

## Task Router — Keyword → On-Demand Context

| Keywords | Load | Why |
|---|---|---|
| permission, role, auth, access, group, TL scope | `.devin/context/01-PERMISSIONS.md` | Most complex system; easy to break |
| model, field, migration, queryset, schema | `.devin/context/02-DATA-MODELS.md` | Entity relationships before queries |
| component, hook, page, context, React, CSS, visual, mobile, frontend test | `.devin/context/03-FRONTEND-PATTERNS.md` | Composition + test conventions |
| screenshot, fingerprint, visual verify/diff, UI refactor verification | `.devin/context/12-VISUAL-VERIFICATION.md` | Fingerprint capture + diff tooling |
| modal, dialog, form dialog, confirm, drawer | `.devin/context/03-FRONTEND-PATTERNS.md` §13 | Dialog contract + tone scale — then `node scripts/modal-audit.mjs` |
| checkbox, bulk edit, bulk action bar, selection count | `.devin/context/03-FRONTEND-PATTERNS.md` §14 | Reuse the shared checkbox/badge/entrance treatment |
| status color, tone, palette color, badge color | `.devin/context/03-FRONTEND-PATTERNS.md` §15 | tone.ts semantics; check the "not migrated" list first |
| endpoint, serializer, ViewSet, API, URL, service | `.devin/context/04-API-PATTERNS.md` | DRF + service layer patterns |
| add feature, new page, new endpoint, end-to-end | `.devin/context/05-COMMON-TASKS.md` | Step-by-step recipes |
| overtime, standby, leave, balance, MonthlyLock, carryover | `.devin/context/06-DOMAIN-INVARIANTS.md` | Domain rules that must not break |
| payroll, wage, payslip, gross-to-net | `.devin/context/PLUGINS/01-payroll.md` | Payroll lifecycle invariants |
| control room, CR, standby projection | `.devin/context/PLUGINS/02-control-room.md` | CR scoping rules |
| ticket, KPI, evidence upload | `.devin/context/PLUGINS/03-ticket-kpi.md` | Ticket KPI invariants |
| skills, proficiency, matrix, gap report, skill rating | `.devin/context/PLUGINS/04-skills.md` | Skills plugin invariants |
| organigrama, org chart, Tech grouping | `.devin/context/PLUGINS/05-organigrama.md` | Live chart + builder invariants |
| import, CSV, Excel, bulk upload, data import, sample template, importer | `.devin/context/PLUGINS/06-data-import.md` | Importer contract + per-target authority |
| calendar, workspace, workspace_users | `.devin/context/07-CALENDAR.md` | Calendar privacy + workspace rules |
| chart, Recharts, analytics visualization | `.devin/context/08-ANALYTICS-VISUALIZATION.md` | Chart sizing + data-source rules |
| plugin permission, render surface, plugin slot, metadata, resource access, remove/disable a plugin | `.devin/context/09-RESOURCE-ACCESS.md` + `.devin/context/10-PLUGIN-PERMISSIONS.md` | Group grants, plugin gates, removal safety |
| file location, where is, find file | `.devin/context/PROJECT_INDEX.md` | Directory inventory |
| plan, create plan, megaplan, refactor plan, optimize plan, plan review | `.devin/context/11-PLAN-CREATION.md` | Senior plan protocol: zero-hallucination specs + self-correcting gates |
| past bug, session history, what changed | `AGENTS.md` (recent) + `.devin/tracking/agents-archive-*.md` | Session logs |
| production security, deploy, Docker, TLS, CORS, gunicorn | relevant production-security plan + `.devin/context/04-API-PATTERNS.md` | Deployment hardening rules |
| cross-stack impact, blast radius, call graph, type hierarchy, find usages across Django↔React | `.devin/context/trace-mcp.md` (usage guidance) + trace-mcp MCP server (`get_change_impact`, `get_call_graph`, `find_usages`) | Precomputed graph — use instead of 10 grep/read calls |

## Hot Invariants

- **Permissions** — multi-role users are normal. Pure-HR write block uses
  `is_hr_only()`. TL scope is `get_team_member_ids()`. Never ORM-filter
  removed `profile__is_team_leader` or `profile__team` columns.
- **CR-scoped UI** — CR-only users/admins get no My Clients, no notification
  preferences in Settings, no Organigrama sidebar injection. Multi-role CR
  identities keep their higher-role behavior.
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
- **Skills Matrix** — read `PLUGINS/04-skills.md` first. Keep public `view`
  access with queryset/object scoping, TL scope via `get_team_member_ids()`,
  and use matrix `user_skill_id` (not `skill_id`) for rate mutations.
- **Frontend plugin service URLs** — axios `baseURL` already ends in `/api`,
  so plugin services use `BASE = "/plugins/<name>"`, never
  `"/api/plugins/<name>"` (doubled `api/` → 404). Tests mock the API layer and
  do not catch this.
- **React Query keys** — include every result-changing parameter (userId,
  workspaceScope, page_size, month/year filters). Never build a constant key
  with conditionals like `condition ? scope : "self"`.
- **Dialog contract** — width via `size` (sm 448 / md 512 / lg 672 / xl 896);
  never pass `max-w-*`, `flex`/`overflow` or `p-0` to `DialogContent` (use
  `padded={false}`, `hideClose`). One scroll region: `DialogBody`. `cn` is
  tailwind-merge — prefixed and unprefixed classes are SEPARATE merge groups,
  so a callsite class does not always win. Colors use tone tokens
  (`bg-tone-<t>-surface`, `text-tone-<t>-text`) which carry the light/dark
  pair, so `dark:` is a bug. Done = `node scripts/modal-audit.mjs` exit 0.
- **Checkboxes/bulk bars/count badges** — reuse `Checkbox`/
  `TriStateCheckbox` as-is and the gradient `AnimatedNumber` badge from
  `BulkActionBar`/`BulkDrawerHeader` — never a flat `bg-primary` circle or an
  unanimated bulk bar.
- **Plugin removal safety** — core code and other plugins must NEVER
  statically import a plugin's modules. Register the component in
  `frontend/src/plugins/index.ts` and consume it via
  `getPluginComponent(plugin, component)` behind a core-owned wrapper gated
  on `usePlugins().activePlugins` (`PluginSlot`,
  `components/admin/PluginImportButton`). `remove_plugin` detects
  cross-plugin **Python** imports only and matches frontend files by
  **filename**, so a stray TS import passes its dry run and breaks
  `npm run build` on removal. Check before claiming removability:
  `grep -rn "plugins/<name>" frontend/src | grep -v "^frontend/src/plugins/<name>/"`
  — only `frontend/src/plugins/index.ts` may match.
- **Plugin permission actions are fixed** — `view`/`manage`/`configure`/
  `export` only; `validate_manifest` raises on anything else, so a
  per-feature action can never be seeded and denies every non-staff user.
  Scope inside the plugin's viewsets instead.
- **Data import** — the importer class is the single source of truth for a
  target's fields, options, sample rows and authority. Never branch on
  `target_key` in the frontend. Each importer's `check_authority` re-applies
  the authority its own admin page requires, so the plugin `manage` grant
  does not unlock every target; the same scoping covers profiles and batch
  history (`row_errors` quotes cell values). Upload size is checked before
  the file is parsed. Template downloads use `file_format=`, not `format=`
  (DRF reserves it). A blank cell means "leave this alone", booleans
  included. A bookkeeping failure after commit must never turn a committed
  import into a 400. Read `.devin/context/PLUGINS/06-data-import.md` before
  adding a target.
- **UI/accessibility baseline** — reuse shared primitives (`GlassCard`,
  `StatCard`, `DataTable`, `EmptyState`, `ConfirmDialog`) and theme tokens; no
  raw hex or slate/zinc/gray. New controls need accessible labels, keyboard
  behavior, 320px+ layout, light/dark check. See `03-FRONTEND-PATTERNS.md`
  §10-11.
- **Dependency/build files** — `.gitignore`'s venv block must keep anchored
  `/lib/` `/lib64/` (bare patterns once excluded `frontend/src/lib/` from every
  commit). `Dockerfile` installs `requirements.txt` +
  `requirements-production.txt` in ONE `pip install` — splitting lets an
  unconstrained second install upgrade Django/DRF and break the build.
- **Removed plugins / dead code** — never reference: `budget`,
  `email_notifications`, `export` plugins; `EmailTemplate`,
  `EmailNotificationRule`, `send_notification_email`,
  `trigger_notification_rule`, `send_upload_reminders`, `upload_reminder`;
  `UserViewSet.import_users`; `manual_export_check.py`;
  `Skill.display_order`/`SkillCategory.display_order` (gone in migration
  `0005`; ordering is A-Z by `name`).

## Skill Triggers

| Task | Skill |
|---|---|
| Any implementation or bugfix | `test-driven-development` |
| Backend query/perf change | `django-perf-review` |
| Auth/permission/input change | `security-review` |
| Code review requested | `review` |

## Verification Commands

Targeted while iterating; the full pass exactly once, after implementation.

```bash
# Iterating — narrow the path, never the whole suite
python manage.py test apps.<app>.tests.<name>
cd frontend && npx vitest run src/<path> && npx eslint src/<path>
```

```bash
# Final pass — repo root, then frontend/
python manage.py check && python manage.py test &&   python manage.py makemigrations --check &&   python -m ruff check apps core config plugins --output-format=concise

cd frontend && npx tsc -b --noEmit && npx eslint src &&   npx prettier --check "src/**/*.ts" "src/**/*.tsx" &&   npx vitest run && npm run build
node scripts/modal-audit.mjs   # whenever a dialog changed
npx fallow dead-code && npx fallow dupes   # structural changes
```

## Tooling Gotchas

- **rtk filters `git` output** and under-reports: `status --porcelain | wc -l`
  read 0 with files dirty; `push` said `Everything up-to-date` for an unpushed
  commit. Confirm with `git ls-files -m`, `rev-parse`, `ls-remote`.
- **`.devin/` is gitignored** — local knowledge only; anything the repo must
  carry goes in `CLAUDE.md` or code comments.
- **DRF reserves `format`** (renderer negotiation, 404s on unknown values).
  Name file-type params `file_format`.
- **Plugin URLs mount at import time** from enabled plugin rows — a disabled
  plugin 404s, so backend tests call viewsets directly, not by URL.

## Session Guidelines

Quiet/concise flags and targeted reads; focused tests while developing and the
full suite once at the end; one feature/bug/PR per session.

## Maintenance — Keep This File in Sync with `.devin/`

`.devin/` is authoritative; this overlay is a Claude-optimized lens. Mirror
only the delta when a `.devin/` file changes: the router row and the affected
Hot Invariant. Never copy full contents. Keep under 200 lines.
`validate-state.ps1 -Event Manual` is the cross-tool validator.

## Workflow Sync Command

When you say "update workflow" or "sync workflow":
1. Read `.devin/rules/CONTEXT.md` and compare its router table with CLAUDE.md router table
2. Add any missing keyword → file mappings to CLAUDE.md (paths must be `.devin/context/` for Claude)
3. Compare CONTEXT.md Critical Guardrails with CLAUDE.md Hot Invariants
4. Add any missing invariants to CLAUDE.md
5. Compare verification commands and update if needed
6. Report what was added/changed
