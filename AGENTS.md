# Project Instructions

## Shared workflow invariants

Read `docs/workflow-invariants.md` before changing payroll, overtime, standby, leave, notifications, or the e2e environment. It is the tracked source for the test gate, the month cutoff, approval transitions, leave balance rules, notification delivery, the TL-closure default, and the e2e and browser recipes. `.devin/` is local-only (gitignored), so any `.devin/...` reference below may be missing on a fresh clone.

## Restructuring — 2026-09-08

Reduced AGENTS.md from 1,346 lines (92.7 KB) to 78 lines (3.8 KB) per
external review guidance. Historical session outcomes moved to
`.devin/tracking/agents-archive-2026-09.md`. Trace-mcp details moved to
`.devin/context/trace-mcp.md`. Current baselines moved to
`.devin/tracking/current-state.md`. Router `.devin/rules/CONTEXT.md` updated
to reference the new structure.

## Scope
- Read relevant existing code before editing.
- Keep changes limited to the requested scope.
- Preserve existing API contracts unless a breaking change is explicitly requested.
- Do not modify generated files, secrets, production configuration, or unrelated work.
- Never commit or push unless explicitly requested.

## Required reading for every agent
- `CLAUDE.md` (tracked) holds the "Hot Invariants" (permissions, payroll scope, HBPR, fail-closed imports, tech levels, ...). They apply to all agents, not just Claude Code; read it before touching those areas.

## Repository
- Backend: Django/Python.
- Frontend: React/TypeScript.
- Backend source and apps: `apps/`
- Frontend source: `frontend/src/`
- Backend tests: Django/Pytest tests near the relevant app.
- Frontend tests: `frontend/src/**/*.test.*`
- Plans: `.devin/plans/`
- Domain context: `.devin/context/`
- Historical outcomes: `.devin/tracking/agents-archive-*.md`
- **Tracked design/engineering contracts** (`.devin/` is gitignored, so durable
  cross-agent knowledge must live here): `DESIGN.md` (design system + surface
  inventory), `CLAUDE.md` (hot invariants), and `docs/*.md` — currently
  `docs/table-header-contract.md` (table header rule, gate, migration queue).

## Workflow

The AI workflow uses a small always-on router in `.devin/rules/CONTEXT.md` and
routed domain context under `.devin/context/`. Historical detail lives in
`.devin/tracking/`.

- `.devin/rules/CONTEXT.md` is the always-on router and guardrail file.
- `.devin/context/00-INDEX.md` is the on-demand context index.
- `.devin/context/11-PLAN-CREATION.md` is the senior plan protocol — load it
  when creating or optimizing any implementation plan (zero-hallucination
  research, exact before→after specs, self-correcting gates, agent rules).
- Domain files are loaded only when selected by the router.
- Use targeted verification during iteration and one full verification pass at
  the end. Do not dump full logs, lockfiles, generated bundles, or archives
  into context.
- Record session outcomes as short entries in `.devin/tracking/agents-archive-<date>.md`.
- Never commit or push unless explicitly requested.

### Code Intelligence (trace-mcp)

trace-mcp is wired as an MCP server for both Devin (`.devin/mcp_config.json`)
and Claude Code (`~/.claude.json` + hooks). It indexes the codebase graph
and serves framework-aware cross-stack queries.

- **Use for:** cross-stack impact analysis ("what breaks if I change
  `OvertimeLog`?"), call-graph traversal, type hierarchy, find-usages across
  Django↔React boundaries, `get_task_context` for composite tasks.
- **Do NOT use for:** tasks the `.devin/` router already covers (domain rules,
  invariants, permission checks, plan creation). The router is faster for
  curated context; trace-mcp is for structural/dependency questions.
- **Configuration details:** See `.devin/context/trace-mcp.md` for installation,
  hooks, benchmark notes, and manual reindex instructions.

## Backend Rules

- Enforce authorization server-side.
- Preserve tenant, role, and permission boundaries.
- Use transactions and row locks where required by the domain.
- Create migrations for model changes.
- **Use `py -3.14` for every Django command — never bare `python`.** The stack is
  Python 3.14 + Django 6.1.1 (`requirements.txt` pins it; CI runs 3.12 + the same
  pin). Local `python` is 3.11 + Django 5.2: a suite run there is green against
  the wrong framework version, discovers a different test set, and is not
  evidence. History: `docs/superpowers/UPGRADE-JOURNAL.md`.
- Run:
  - `py -3.14 manage.py check`
  - `py -3.14 manage.py makemigrations --check`
  - relevant Django/Pytest tests (`py -3.14 manage.py test apps.<app>`)
  - Ruff on changed Python files

## Frontend Rules

- Use existing shared UI primitives and semantic design tokens.
- Do not introduce raw colors when an existing token is available.
- Preserve responsive behavior and accessibility.
- Every interactive control must have an accessible name.
- Preserve API query keys and payload contracts unless explicitly changing them.
- **Tables**: header typography and the header fill come from
  `frontend/src/components/ui/tableStyles.ts` — never inline in a `<thead>`.
  Row actions (`id: "actions"`) float in a hover pill on fine pointers
  (`RowActionsPill`). A column whose cells hold Approve/Reject or any other
  decision control must set `meta: { actionsDisplay: "column" }`; the approval
  helpers in `tableColumnHelpers.tsx` already do. Never hide a pending decision
  behind hover.
  Gate: `cd frontend && node scripts/table-header-audit.mjs` exit 0 (state at
  handoff 2026-10-05: **PASS — 0 violations across 19 files**). Read the tracked
  `docs/table-header-contract.md` before touching any table: the rule, the
  converge-vs-migrate recipe, traps, known gaps.
- Run:
  - targeted Vitest tests
  - TypeScript checking
  - ESLint on changed files
  - Prettier on touched files
  - production build when applicable
  - `node scripts/table-header-audit.mjs` when any table is touched

## Security

- Never expose secrets, tokens, cookies, or personal data.
- Treat all client-side authorization as presentation only.
- Validate permissions again on the backend.
- Reject invalid uploads and malformed input closed by default.
- Stop and ask before changing authentication, authorization, migrations, or production configuration.

## Shipping a scoped change (2026-10-12)

- The working tree is shared. Before committing, run `git status` and stage explicit paths only (`git add <paths>`). Never `git add -A`, and never sweep in another worker's files.
- Branch from `origin/main` for a new change (`git switch -c <type>/<slug> origin/main`, then carry only your own edits). Do not commit to a branch another workstream is using.
- Push and open a PR with `gh pr create`. Merge only after the gates below are green. Do not merge a PR that contains files outside its stated scope.
- Gates before push: targeted Vitest for touched areas, `npx tsc -b`, `npx eslint <touched>`, `npx prettier --check <touched>`, `node scripts/table-header-audit.mjs` when a table is touched, and `npm run build` for frontend changes.
- Flaky-test rule: if a test fails only in the full suite and passes alone, record the test name and the suite result in the PR, then open a follow-up. Do not hide it.

## Concurrent Workers (2026-09-20)

Multiple agents share this tree and push to `main` frequently. To avoid
destroying each other's uncommitted work:

- Announce workstream + file list before starting; one worker per overlap
  zone at a time (`plugins/payroll/*`, `plugins/skills/*`, dashboard
  components).
- Stage only paths you authored (`git add <paths>`), never bare `git add -A`
  without a `git status` review.
- Never `git checkout --`, `git stash`, or `git clean` paths you didn't author.
- Never reformat files outside your change (run Prettier on touched files only).
- Verify `git status` before and after any git operation; if another worker's
  files disappear, stop and report instead of re-applying blindly.

## Test Environment (2026-10-02)

- Production is Python 3.12 + Django 6.1.1. Run backend tests with `py -3.14 manage.py test` (Django 6.1.1); the default `python` is 3.11 + Django 5.2 and hides Django-6 differences.
- `.devin/` is gitignored: durable, cross-agent knowledge must live in tracked files (`CLAUDE.md`, `docs/`). HBPR/scorecard: `docs/hbpr-and-scorecard.md`.
- Playwright: run `prepare_e2e_db` before the servers start (see `.devin/context/12-VISUAL-VERIFICATION.md`).

## Completion

- Summarize the implementation.
- List modified files.
- List commands actually executed and their results.
- Clearly identify failed, skipped, or environment-blocked checks.
- Do not claim a test passed unless it was run.

## UI redesign note (2026-10-06)

Button variants (`frontend/src/components/ui/button.tsx`) and light tokens were refreshed; TL scorecard, HBPR and My Records layouts redesigned. Rules and verification recipe (CloakBrowser MCP) live in `.devin/context/03-FRONTEND-PATTERNS.md` §18 and `CLAUDE.md` Hot Invariants; every IDE entry point (`CLAUDE.md`, `opencode.json`, `.devin/rules/CONTEXT.md`) routes there.

## Workday EPR goal import (2026-10-06)

Workday owns goal content; this app stores only confirmed short titles on
`EPRGoal.description`. `POST epr-cycles/{id}/parse_goal_pdf/` parses a Workday
goal-setting PDF request-only via `plugins/tl_scorecard/epr_goal_import.py`
(pinned `pypdf==6.19.0`, layout mode, `Weight:`-delimited blocks) and returns
titles only — the upload is never persisted. `complete_stage` accepts optional
`goal_titles` for `goal_setting`/`mid_year` and replaces goals atomically under
`select_for_update()`; `final_review` rejects them. `epr-goals/` is read-only —
goal rows cannot bypass the checkpoints. Multipart posts need the explicit
`{ "Content-Type": "multipart/form-data" }` header on `api.post` or Django sees
an empty `request.FILES` (verified in browser 2026-10-06). Verified:
430 backend tests, 244 tl_scorecard + 2,769 total frontend tests, build,
modal-audit, browser E2E (parse→edit→confirm, mid-year confirm-only,
final-review immutable, 375px/dark, employee My Records).

## Workflow Sync Command

When you say "update workflow" or "sync workflow":
1. Compare `.devin/rules/CONTEXT.md` router table with AGENTS.md (root file should stay lean - no router duplication)
2. Update AGENTS.md workflow section if CONTEXT.md workflow changed
3. Update trace-mcp reference if needed
4. Report any changes made to AGENTS.md

<!-- forge-outcome rules (outcome-first execution) -->
- For substantial tasks: before coding, state the outcome and 1-3 checkable success criteria; confirm with the user if the request had none.
- If the request is vague or self-contradictory, point it out before starting - never silently pick an interpretation.
- For genuinely contested design choices, compare up to 3 approaches against the criteria, name the winner and why, build only the winner.
- When done, verify against the stated criteria and report which pass, with evidence.

## Windows commands
You are on Windows. Emit PowerShell-compatible commands, never bash:
- No `&&` chaining - use `;` or separate statements
- No single quotes around strings with variables; PowerShell uses double quotes for expansion
- Paths use backslashes in native commands
- Forward slashes are fine for node/npm/python arguments

## 2026-10-08 — EPR legacy repair
- `complete_stage`/`parse_goal_pdf` now allow `goal_titles` for an open Goal Setting after later stages (stuck legacy cycles). `describeCycle` has no `blocked` state; `recover` shows "Repair goals". "Log review" renamed "Log management review". Plan: `docs/superpowers/plans/2026-10-08-tl-scorecard-epr-recovery-and-light-theme.md`.

## 2026-10-08 — Light-theme contrast
- Light `--border/--input/--background/--surface-sunken/--line-subtle` raised for non-text contrast (see CLAUDE.md "Light boundaries"); `tokens.test.ts` pins them.
## 2026-10-08 — Partnership log types + dialog width
- TL partnership log grouped by meeting type; HBPR evidence view has a `?evidence_kind=` filter (server-side `?kind=`). TL-scorecard form dialogs moved sm to md.

## 2026-10-08 — UI primitive guideline fixes
- `button.tsx`: explicit transition properties + touch-manipulation; `dialog.tsx` DialogBody overscroll-contain.

## 2026-10-08 — Admin dashboard mockup adoption
- Plan: `docs/superpowers/plans/2026-10-08-admin-gui-mockup-adoption.md`. Admin dashboard has an insights strip (`lib/adminInsights.ts`, per-user dismissals), `?section=` tabs (`config/dashboardWidgets.ts` `widgetSection`), a grouped Customize modal (no drag-and-drop: it never worked), and a Refresh control. Admin mutations call `invalidateAdminDashboard` (`lib/adminDashboardKeys.ts`) so aggregates do not stay stale.
- New staff-only aggregates `admin_trends` / `admin_people` (`apps/dashboard/admin_trends.py`, `admin_people.py`); nine opt-in widgets (never in `defaultAdminLayout`), lazy-loaded, one request per section while a widget is on.
- Ctrl/Cmd+K admin palette (`components/layout/AdminCommandPalette.tsx`) lists only `useAdminNavItems` results. CSV exports neutralise formulas: `core/utils/csv_safe.py` (server), `lib/csvSafe.ts` (client).
- Deferred, decided 2026-10-08: no `approved_at` index (production is PostgreSQL; measure with `QuerySet.explain(analyze=True)` on production-sized data before adding one); no flattening of the stat-card grids for filtered sections (cosmetic, would change the default All layout, not worth the regression risk); no visual-fingerprint baseline (manual browser pass + `e2e/admin-dashboard.spec.ts` cover it); still out of scope: period selector (no backend parameter), table/cards switcher, payroll/audit/plugin widgets (need per-plugin specs).

## 2026-10-08 — Admin dashboard follow-ups
- Plan: `docs/superpowers/plans/2026-10-08-admin-dashboard-follow-ups.md`. Insights deep-link with `?status=pending` (`useUrlParamState`, accepts only allowed values; overtime/standby/leave-request filters read it). Users page reads `?role=` and `?q=` (`DataTable initialSearch`).
- `CommandPalette` (generic) + `AdminCommandPalette` wrapper: per-user recents (`paletteRecents.ts`), admin-only debounced user search (`userSearch` prop, server-scoped `getProfiles`), also mounted in `AppShell` with Ctrl/Cmd+K (navigation only, no user search).
- Dashboard presets are config only (`config/dashboardPresets.ts`, resolved against available widgets; never grant visibility); `DashboardContext.updateLayout` shares the ordered save queue with toggles. PDF export: `ChartCard sectionId` + dynamic `captureChartsToPdf`. Trend period: `?months=3..24` on `admin_trends` (400 outside), selector keeps it in the URL; trends query key is `["admin","trends",months]`.
- Gotcha: a stale `runserver` left on :8000 makes Playwright reuse old backend code (`reuseExistingServer`); check `netstat` before an e2e run.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## 2026-10-10 — Admin visual lift
- Plan: `docs/superpowers/plans/2026-10-10-admin-visual-lift.md`. Mockup polish for the 27 admin routes: `.surface-lift` cards, `RowActions` (sticky actions column), `FilterChipRow`, `StatCard iconTone/delta/to`, `AdminBreadcrumbs` via `resolveAdminCrumbs` (`ADMIN_PLUGIN_CRUMBS` for plugin routes). Invariant is in CLAUDE.md Hot Invariants. Browser fingerprint/Playwright verification was not run in the worktree; report history needs a backend writer (F11, not done).

## 2026-10-10 — Admin visual lift plan review (corrections)
- Reviewed the plan line by line against source after the sweep landed on `main`; findings F1–F12 and every listed file target were accurate (verified with file:line).
- Corrections now in the plan: Page-Gate stop rule (`wip(visual):` when G1–G5 cannot run, never a `feat:`/`fix:` that implies verification); D1 reframed as an identity/hue restoration (the replaced value was already AA at 5.19:1, so it is not an accessibility fix); sticky actions cells must compose with `TABLE_BODY_CELL_CLASS`/`TABLE_HEAD_CELL_CLASS`; `group/row` goes in `DataTable`'s base row class, not the `getRowClassName` ternary; `scopeLabel` = "All teams in your workspaces" while a workspace scope is active; Task 0 tabs are cross-checked against `admin-gui-screenshots/manifest.json`; F11 reworded (`GeneratedReportViewSet` does expose a REST create path — no producer calls it).
- Traps (1)–(5) are appended to the CLAUDE.md "Admin visual lift (2026-10-10)" Hot Invariant, so they reach every agent without re-reading the plan.

## 2026-10-11 — TL scorecard / payroll review follow-ups (Phase 8)
- Wage writes are HR or staff only (`plugins/payroll/services/wage_access.py`). The payroll `manage` grant alone no longer lets a team leader create, change or delete a wage, and the wages importer uses the same check. TLs keep read access to their scoreable team's wage through the TL scorecard.
- Team-scoped payroll: only staff, superusers and HR are company-wide viewers; the payroll `manage` grant alone grants nothing. `GET /api/plugins/payroll/runs/scope/` returns `run_scope: company|team`, and `PayrollRun.notes` is hidden from and not searchable by team scope.
- Scoped draft regenerate: `generate_draft_run(..., replace_user_ids=...)` replaces only the rebuilt users' lines and entries. Note: `_allowed_payroll_user_ids` is unrestricted only for staff, superusers and HR; a `manage` holder who is not HR is scoped to self + team (2026-10-11). `generate` requires `manage`, so a team leader does reach the scoped regenerate path, which replaces only their team's lines. The view test patches the scope.
- Processing-period exports floor the start date to the first of its month (periods are stored as the 1st).
- Export leave/overtime: `kpi_rows(..., include_leave_overtime=False)` drops those areas for HBPR-only viewers (XLSX summary and PDF cover/summary).
- Team wage status `conflict` (overlapping active wages) is distinct from `missing`.
- Tirane calendar day: `core/utils/timezone_local.tirana_today()` (Europe/Tirane) is the one helper. Engagement and the TL scorecard default-month, year and team-date selections use it; Django's UTC `date.today()` gave the previous month for the first hours of each Tirane month. Still on `date.today()` by design or not yet migrated: `services.absence_metrics` and `reporting_period`'s `date.today()` fallback, which only a caller passing `None` reaches (the viewset never does).
- **Documented, not cached (item 13):** `NotificationEventTypeConfig.is_type_enabled` runs one query per call, and `_create_notification` calls it once per recipient, so a fan-out event costs one kill-switch query per recipient (plus the preference lookups). It is not cached: an admin toggle would need cache invalidation, and Django's TestCase does not clear cache between tests (see `disabled_event_types` docstring). Follow-up if fan-out grows: fetch `disabled_event_types()` once per batch.
- **Follow-up, not built (item 14):** the TL scorecard Team tab always uses the caller's own team (`leader=self`). Letting staff pick another leader would be a feature (the endpoint already accepts `?leader_id=` for staff).

## 2026-10-11 — Notification visibility + kill-switch lifecycle
- Branch `feat/notification-visibility-lifecycle` (uncommitted; unrelated working-tree files untouched). Settings lists only types the user can receive: team types for team leaders (`is_team_leader`), oversight groups for assigned HBPRs (`is_hbpr`). HR/staff no longer see dead toggles.
- Scorecard types unregister on `tl_scorecard` disable and re-register on enable (`notification_types.ALL_TYPES`). `_create_notification` returns early when `Plugin(name='notifications')` is explicitly disabled; a missing row stays open.
- `NotificationEventTypeConfig.event_type` uses `config_event_type_choices()` (no preference-group keys). Migration `notifications/0011`, choices-only.
- Settings refetches preferences on window focus, skipped while a save is in flight.
- Gates: `py -3.14 manage.py test plugins.notifications plugins.tl_scorecard` 572 OK; `npx vitest run src/pages/settings src/plugins/notifications` 62 OK; eslint + prettier clean on touched files; ruff clean on both plugin dirs.
- Not done: live browser check of the kill-switch (Phase 0 evidence); durable invariants not yet rotated into `.devin/context/` (no notifications context file exists).
- Test isolation: tests that call `tl_scorecard.signals.disconnect()` must call `signals.connect()` in teardown.

## 2026-10-12 — OT/standby month cutoff, TL edit guard, bulk query budget
- Month cutoff (`apps/users/services/approval_periods.py`: `work_date_cutoff`, `is_work_date_open`, `assert_work_date_open`): a work date in month M is accepted only before 00:00 on the 2nd of M+1, Europe/Tirane. Enforced on OT and standby create, and on update only when `date` actually changes. HTTP 400 for every user, staff and superuser included. Current-month dates are never blocked.
- Carryover inside the window is unchanged (`resolve_processing_assignment`), pinned by `test_in_window_late_entry_carries_over`.
- TL edit guard: `check_object_permissions` on `OvertimeLogViewSet` and `StandbyLogViewSet` returns 403 for update/partial_update on another user's record unless staff or superuser. Defense in depth: a TL's direct PATCH already returns 404 from the personal queryset.
- Bulk actions: the actor's team-member ids are cached per bulk action via `actor_team_scope_cached` (`core/mixins/permissions.py`). The cache lives on the actor's profile only for the duration of the action. Overtime `perform_destroy` evaluates the approval-period lock only for superusers, where it is used for the audit log.
- Query budgets: `apps/overtime/test_bulk_query_budget.py`. Bulk approve is at or under 8 queries per row. Bulk delete ceilings are 10 (approved) and 9 (pending). The delete ceilings are not the goal of 8: the remaining work is the payroll reference check (2, pinned by the finalized-payroll tests), the row lock, the cascade, the audit insert and a nested savepoint.
- Known, not changed: `ProcessingPeriodManager.bulk_create` (overtime and standby) skips the cutoff; no production caller exists. The data importer uses `save()` and also skips the cutoff; this is intentional for HR back-office imports.
- Known, decided: TLs can read team entries through a `workspace_ids` scope (workspaces are the calendar sharing model); writes are blocked by the edit guard. TLs can still bulk-delete team entries under `DeletePermissionMixin`; the edit guard does not cover deletion.
- Gate: `python manage.py test apps.overtime apps.standby apps.users apps.reports apps.permissions apps.dashboard apps.leave_management plugins.payroll plugins.notifications plugins.data_import plugins.audit_log plugins.control_room` → 1428 OK (earlier subset gate, superseded by the full gate below).
- Full gate as of 2026-10-12: `py -3.14 manage.py test` → 2737 OK, `ruff check` on changed files. See `docs/workflow-invariants.md`.
- 2026-10-12 — merged: TL-closure gate ON by default (PR #105, migration 0011); leave balance follows approve/reject transitions and OT/standby approve/reject refuse non-pending entries (PR #106). Details and rules in `docs/workflow-invariants.md`.

## 2026-10-14 — Organigrama rework: shapes, orthogonal connectors, 3D & mobile auto-landscape
- Connectors: straight 90° orthogonal step paths (`getSmoothStepPath` with `borderRadius: 0`) and direct point-to-point lines with directional markers.
- Node shapes: five geometric silhouettes (`pill`, `chamfered`, `sharp`, `soft`, `leaf`) and border styles (`solid`, `dashed`, `dotted`, `double`, `glow`).
- 3D perspective: spatial 3D mode with perspective tilt, elevation and node drop shadows.
- Mobile experience: portrait defaults to semantic searchable hierarchy tree with "Interactive Graph" toggle; pinch-to-zoom and touch panning enabled; rotating to landscape (max-height 550px) automatically switches to full-height interactive graph with return toggle to list view.
- Gates: vitest 167/167 OK across 22 suites, backend tests 165/165 OK, tsc clean, eslint clean, prettier clean, table-header-audit 0 violations, production build clean.

## 2026-10-14 — PDF export bundling & layout modernization
- Multi-chart bundling: `captureChartsToPdf` (`frontend/src/components/visualization/pdfExport.ts`) dynamically packs consecutive charts onto each A4 page based on remaining page height (`GAP = 14pt`), replacing the previous 1-chart-per-page behavior and eliminating 75%–90% empty white space. Page breaks occur only when a section overflows `usableBottomY`.
- Headers and footers: Cover header on Page 1 (13pt bold title, 7.5pt muted provenance line with date/time, author, period, and full-width divider); running header on Pages 2+ (8pt running title, right-aligned period label, divider); two-pass running footer on all pages with `"Page X of Y"` and full-width divider.
- Quality & preservation: Preserves scroll-expanded table rows and WYSIWYG colors (`html2canvas-pro` + `jsPDF`).
- Gates: vitest 10/10 OK (`pdfExport.test.ts`), `DashboardActionsMenu` 12/12 OK, `TLScorecardVisualizationPage` 7/7 OK, tsc clean, eslint clean, prettier clean, table-header-audit 0 violations, production build clean. Live browser export verified (Admin Dashboard reduced from 10 to 5 pages with 2 charts per page and proper pagination).

## 2026-10-15 — Holiday unification, plugin fail-closed isolation & admin settings redesign
- Global HR holidays and Payroll Work Calendar holidays unified via two-way sync (`apps/dashboard/services/holiday_sync.py`: `sync_holidays_between_hr_and_payroll()`), with missing holidays backfilled into HR and HR names authoritative.
- Fail-closed isolation: When the payroll plugin is disabled or uninstalled, `holiday_sync` and signals (`apps/dashboard/signals.py`) skip payroll mutations gracefully (`status: skipped, reason: payroll_plugin_disabled`), preventing DB errors or crashes during public holiday CRUD.
- Automatic sync on plugin reactivation: `PayrollPlugin.ready()` (`plugins/payroll/plugin.py`) triggers holiday synchronization when payroll is enabled or initialized. Superseded 2026-10-20 (launch review C-1): the sync now runs from `manage.py sync_payroll_holidays` in `docker/entrypoint.sh`, not `ready()`. The entrypoint runs it only with `RUN_MIGRATIONS=1`; on a dev box, or after enabling the Payroll plugin, run `py manage.py sync_payroll_holidays` by hand.
- UI resilience: `usePlugins()` provides fallback empty metadata (`DEFAULT_PLUGIN_CONTEXT`) when unmounted or in tests; admin and HR pages (`GlobalSettingsPage`, `CalendarManagementPage`, `HRCalendarsPage`) dynamically show payroll work calendar links, sync actions, and sync descriptions only when `payroll` is active.
- Global Settings redesign: 4 categorized glassmorphic tabs (Branding & Identity, Vacation & Carry-Over, Workplace & Hours, System & Operations) with live identity mockup preview, standard 40-hour workweek baseline, and operational cut-off references.
- Gates passed: `py -3.14 manage.py test apps.dashboard.tests.test_holiday_sync` 8 OK, `node scripts/table-header-audit.mjs` 0 violations across 913 files, `npx tsc -b` clean, `npx eslint` clean, `npx prettier --check` clean, `py -3.14 manage.py check` 0 issues, `py -3.14 manage.py makemigrations --check` no changes, `npx vitest run calendar` 36 suites / 188 tests OK, `npm run build` OK.

## 2026-10-13 — Leave carry-over and detail drawers
- Year-end vacation carry-over (`apps/leave_management/services/carry_over.py`), holiday-aware vacation days (`count_leave_days`, `days_counted` snapshot). Rules in `docs/workflow-invariants.md` §Leave balances.
- One detail-drawer pattern for the user and team panels (`DialogContent side="right"`), floating `RowActionsPill` on fine pointers.

## 2026-10-15/16 — Readiness follow-ups and admin sweep (#118 to #126)
- Env-driven ingress trust (`INGRESS_TRUSTED_CIDR`, `INGRESS_REAL_IP_HEADER`); push without VAPID keys degrades to a warning; runbook ingress and Redis notes.
- Admin Users: server-side search and paging, team filter, in-place Control Room grant; data-import preview/commit parity fixes; calendar sharing normalises group names.

## 2026-10-17/18 — UI convergence and plugin sweep (#127 to #143)
- Admin and user surfaces share one set of primitives; raw status palettes replaced by tone tokens.
- A runtime-disabled plugin refuses its API for everyone (`PluginPermissionMixin`); guards: `apps/plugins/test_core_plugin_isolation.py`, `test_plugin_view_guard.py`, `ticket_kpi/test_core_coupling.py`. Payroll finalize refuses stale drafts; skills exports gated on the `export` grant. Checklist in `docs/workflow-invariants.md`.

## 2026-10-19 — Business timezone, derived TLs, retention (#144 to #157)
- `business_today()` replaces naive "today" everywhere, with an AST guard (`core/test_business_today_guard.py`); the zone is `GlobalSettings.business_timezone`.
- Teams show derived Italian and Albanian TLs (`TeamSerializer.italian_tl` / `albanian_tl`); admin Tech and Clients KPI strips; TL wages hidden while Payroll is disabled; `purge_audit_logs` and `purge_analytics_data` enforce retention.

## 2026-10-20/21 — Launch review programme
- Plan `docs/superpowers/plans/2026-10-20-launch-review.md`; register and go/no-go in `docs/reviews/2026-10-20-launch-review.md`. Findings are fixed by ID (B, M, S, C, P, D), one commit each, test first.
- Row-ownership matrix test over every API route (`apps/permissions/test_row_ownership_matrix.py`) and the team confidentiality ruling (employees self-only; recorded in CLAUDE.md and `docs/workflow-invariants.md`). Fixes: M-1..M-3, S-1..S-3, C-1..C-7, P-1..P-4, B-01 (CI clock-independence).
- Docs refreshed to match code (D-n rows): CLAUDE.md router and invariants, workflow-invariants, production runbook section 5, README, `.dockerignore` contract. Deferred items are triaged in the register ("Deferred items triage").

## 2026-10-26 — Client archive lifecycle (A1-A5b)
- Plan `docs/superpowers/plans/2026-10-26-client-archive.md`, spec `docs/superpowers/specs/2026-10-26-client-archive-design.md`; rules in `docs/workflow-invariants.md` item 30. Clients are archived, not deleted: `PROTECT` on overtime, a `pre_delete` guard for standby/ticket-KPI links, 409 with counts, superuser-only archive/unarchive/delete, export-then-purge for onboarding data.
- Frontend: pickers ask `?is_active=true` (`useActiveClients`, key `["overtime","clients","active"]` — the admin Clients page keeps `["overtime","clients"]`; sharing one entry silently filters the admin list). Edit dialogs inject the record's own client back, or a client archiving unassigned leaves the field blank. The Clients page follows the row across the Status filter on archive/unarchive.
- Browser evidence: `frontend/e2e/client-archive-lifecycle.spec.ts` (7 tests × `chromium` + `mobile-chromium` = 14) pairs every UI expectation with the API answer — archive/unarchive round-trip, the archived-data dialog and its blockers, the picker excluding the archived client, an employee's old record still showing it, and a real ZIP download from the read-only archived onboarding view. Run `py -3.14 manage.py prepare_e2e_db --settings=config.settings_e2e` first (enables plugins), then `cd frontend && npx playwright test e2e/client-archive-lifecycle.spec.ts`. The fixture is a **per-project** probe client (`ARCPROBEC`/`ARCPROBEM`), created/archived in `beforeAll` and restored in `afterAll` — do not point it back at the shared seeded `E2E Test Client`, or the two projects (which run concurrently) archive and restore it under each other.
- Fixed while verifying (2): `seed_e2e_data` now clears the seeded accounts' MFA state (`UserMFA` rows + both `mfa_required` flags). A leftover enrolment made `/api/auth/token/` return no access token, so `role-workflows`' overtime step failed with "Token is invalid" on every later run; the fixture is now deterministic again.
- Fixed while verifying: the `apps/plugins/test_core_plugin_isolation.py` allow-list had been stale since the audit-logging commit (`security_audit.py`/`audit_archive.py` missing, `mfa.py` no longer importing `audit_log`) — `main` was red on those two tests before this work.

## 2026-10-26 — Closed-year write lock (Y2)
- Plan `docs/superpowers/plans/2026-10-26-year-close-snapshot.md`; rules in `docs/workflow-invariants.md` item 31. A `ClosedYear` row freezes that year's overtime and standby for **everyone, superusers included**; `manage.py reopen_year --year Y --reason "..."` (audited, reason required) is the only way out. Leave is deliberately exempt.
- One service (`apps/users/services/approval_periods.py`). `assert_work_date_open` calls `assert_year_open` first, so every serializer inherits the lock; `MonthlyLockMixin` covers update/delete/approve/reject but **not** `retrieve` (a closed year stays readable); bulk actions fail the row; both importers return a row error; `StandbyLogAdmin` refuses the save; `PayrollRunAdmin` locks a finalized run's `status/year/month/notes`.
- The lookup caches 60 s per process (`CLOSED_YEAR_CACHE_TTL_SECONDS`, `settings_e2e` sets 0). A `TestCase` that closes a year must `addCleanup(clear_closed_year_cache)` — rollback fires no signals.
- Browser evidence: `frontend/e2e/closed-year-lock.spec.ts` (chromium only — a global year close cannot run in two projects). It closes the year out of band through `manage.py shell`, then proves the API refuses create/edit/read-stays-open and that the user sees "2026 is closed … reopen_year" as a toast. Fixture is reset in `beforeAll`/`afterAll` (reopen + delete probe rows), so a re-run is clean.
- Gates: `apps.overtime.test_closed_year_lock` 21 OK, `plugins.payroll.tests.test_run_admin_readonly` 3 OK, full backend 3626 OK, `config` 88 OK, both archive/closed-year e2e specs 16 passed + 2 skipped together.
