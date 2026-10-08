# Project Instructions

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
