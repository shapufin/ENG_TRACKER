# Project Notes

## Workflow

The AI workflow uses a small always-on router in `.devin/rules/CONTEXT.md` and
routed domain context under `.devin/context/`. Keep this file to current state
only; historical detail lives in `.devin/tracking/`.

- `.devin/rules/CONTEXT.md` is the always-on router and guardrail file.
- `.devin/rules/agents.md` contains the compressed specialist roster.
- `.devin/context/00-INDEX.md` is the on-demand context index.
- `.devin/context/11-PLAN-CREATION.md` is the senior plan protocol — load it
  when creating or optimizing any implementation plan (zero-hallucination
  research, exact before→after specs, self-correcting gates, agent rules).
- Domain files are loaded only when selected by the router.
- Use targeted verification during iteration and one full verification pass at
  the end. Do not dump full logs, lockfiles, generated bundles, or archives
  into context.
- Record session outcomes as short entries here; rotate detail into
  `.devin/tracking/agents-archive-<date>.md`.
- Never commit or push unless explicitly requested.

### trace-mcp (code intelligence graph)

trace-mcp is wired as an MCP server for both Devin (`.devin/mcp_config.json`)
and Claude Code (`~/.claude.json` + hooks). It indexes the codebase graph
(1,426 files / 5,864 symbols) and serves framework-aware cross-stack queries
that `code_search` and `.devin/` context cannot replicate in one call.

- **Use for:** cross-stack impact analysis ("what breaks if I change
  `OvertimeLog`?"), call-graph traversal, type hierarchy, find-usages across
  Django↔React boundaries, `get_task_context` for composite tasks.
- **Do NOT use for:** tasks the `.devin/` router already covers (domain rules,
  invariants, permission checks, plan creation). The router is faster for
  curated context; trace-mcp is for structural/dependency questions.
- **Benchmark (2026-09-08, synthetic):** 91.6% token reduction on structured
  tasks (905,753 → 75,729). Production mixed-workload expectation: ~40-55%
  on tasks the router doesn't pre-cover. Re-measure with
  `trace-mcp savings` after real usage.
- **Maintenance:** daemon runs on `127.0.0.1:3741`; auto-reindex after
  every edit via PostToolUse hooks (Claude Code: `~/.claude/hooks/`,
  Devin: `.devin/hooks.v1.json` + `.devin/hooks/trace-mcp-reindex.ps1`).
  For full schema changes (new migration, model rename across files),
  run `trace-mcp index .` manually. Config: `.devin/mcp_config.json`.

Validation: `.devin/validate-state.ps1 -Event Manual` is the repository state
check. It must report only known warnings.

## Current verified state — 2026-08-28

- Full frontend suite: 1745/1745 (2026-08-28); TypeScript, ESLint, Prettier,
  and production build clean. Skills subset: 316/316. `fallow dead-code`: 0
  issues (production).
- Backend: 1162/1162 (2026-08-27); Django check, Ruff, makemigrations check
  clean. Skills backend subset: 105/105 (2026-08-27).
- Skills Matrix Heatmap mode + virtualization implemented 2026-08-27:
  `SkillsHeatmapGrid` with `@tanstack/react-virtual` column virtualization,
  `useGridKeyboardNav` hook extracted from `SkillsMatrixTable`, three-mode
  toolbar toggle (Matrix | Heatmap | List). Heatmap visual modernized:
  `levelHeat()` palette (80% opacity + inset ring), `rounded-sm` cells,
  row+column hover highlighting, distinct dashed unrated cells, L1-L5
  legend. Team shell modernized with compact horizontal filters, explicit View
  grouping, restrained translucent cards, and no empty gap-summary column.
  Visual review fixed virtualized body/header alignment by subtracting the 160px
  sticky member-column scroll margin from each virtual item position. Heatmap
  ARIA contract fixed: explicit aria-rowindex/aria-colindex on every cell,
  columnheader roles, aria-colcount, row separators, opaque sticky header.
  Stale-flag RBAC fix applied to 3 users (`enri.demnushi`, `andrea.negro`,
  `andrea.musset`) — `UserRole` rows now match legacy flags. Local CORS now
  allows Vite port 5174 as well as 5173. Plan:
  `.devin/plans/plan-skills-matrix-density-and-role-fix-2026-08-27.md`.
- Design audit completed 2026-08-27: all 44 pages (login + 20 admin + 15 TL
  - 9 employee) grade A with 100% WCAG accessibility. Two theme-level WCAG
    fixes applied: `--muted-foreground` darkened from 46% to 43% lightness
    (4.39:1 → 4.91:1 contrast on muted backgrounds); `--destructive` darkened
    from 60% to 48% lightness (3.62:1 → 4.59:1 contrast with foreground).
    110 non-token gray/zinc colors replaced with semantic tokens across 21
    files. Audit artifacts in gitignored `design-audit/`.
- plan-skills-ux-improvements.md fully implemented 2026-08-25.
- Skills catalog automation follow-up implemented 2026-08-27:
  `target_level` removed completely from backend and frontend; ordering is
  automatic A-Z (no `display_order` controls); skill/category codes are
  auto-generated from the uppercased name and read-only; names are normalized
  to uppercase on create/update in serializers and in dialog inputs; catalog
  workspace layout tightened (narrower sidebar, compact table padding,
  reduced min-width). Migration `0004_remove_skill_target_level.py` created.
- Known non-blocking issues: six root-hygiene state warnings; pre-existing
  non-Skills Prettier warnings (~48 files); Playwright cannot complete against
  an already-running local server with a stale health URL (readiness uses the
  unauthenticated `/api/health/live/`).
- Skills catalog/team UX redesign implemented under
  `.devin/plans/plan-e28f5733671e08fd.md`: catalog split-pane workspace,
  multi-select Add Skill, admin bulk skill rows, My Skills proficiency
  display, Team filter rail, and main admin sidebar placement.
- Review follow-up implemented 2026-08-27: domain cache invalidation is
  dashboard-prefix scoped; import profile saves update existing mappings;
  overtime/standby approval transitions are row-locked and idempotent; the
  overtime approval client no longer sends an unused rejection payload.
  Focused verification: backend 142/142 and frontend service tests 7/7.

## Current session outcome — 2026-09-08 (GitHub setup + trace-mcp wiring)

- GitHub repo created and first commit pushed: `shapufin/ENG_TRACKER.git`,
  branch `main`, commit `9884859`, 1501 files. `.gitignore` hardened before
  push: added `*.csv`, `*.xlsx`, `export_skills_plugin.py`,
  `Time Tracker UI Project/`, `.claude/`, `.agents/`, `.fallow/`,
  `.ruff_cache/`, `skills-lock.json` — all real employee PII and local AI
  tool configs excluded. Secrets scan: 0 hardcoded secrets in source; dev
  `SECRET_KEY` is intentional and guarded by `settings_production.py`.
- trace-mcp (code intelligence graph) installed, indexed (1,426 files /
  5,864 symbols, 14s), and wired into both Devin (`.devin/mcp_config.json`,
  stdio `trace-mcp serve --preset standard`) and Claude Code (`~/.claude.json`
  + hooks via `trace-mcp init`). Auto-reindex hooks installed for BOTH
  agents: Claude Code PostToolUse hook (`~/.claude/hooks/`) and Devin
  PostToolUse hook (`.devin/hooks.v1.json` +
  `.devin/hooks/trace-mcp-reindex.ps1`) — both fire after edit/write and
  run `trace-mcp index-file <path>` for incremental reindex. Benchmark:
  91.6% synthetic token reduction
  on structured tasks (905,753 → 75,729); production expectation ~40-55% on
  tasks the `.devin/` router doesn't pre-cover. Use for cross-stack impact
  analysis, call graphs, type hierarchy — NOT for router-covered domain rules.
  Re-measure with `trace-mcp savings` after real usage.

## Current session outcome — 2026-09-03 (theme fidelity pass: sidebar sections + admin conversion)

- Theme fidelity pass implemented under TDD per
  `.devin/plans/plan-theme-fidelity-pass-2026-09-03.md` (Admin + TL + Employee
  mockup fidelity; builds on the completed Obsidian-Slate token plan):
  - NEW `components/layout/SidebarSectionLabel.tsx` — ONE shared static mono
    uppercase section-label component consumed by BOTH shells (no duplicated
    markup). `useVisibleNavItems.ts` gained `NavSection` +
    `NAV_SECTION_ORDER`/`NAV_SECTION_LABELS`; `NavItem.section` is REQUIRED
    (compile-safe: `AdminNavItem` is a separate interface). `SidebarNav` groups
    items Core Ops / Leadership / Skills & KPI / System (role-filtered, hidden
    when collapsed) + conditional `Plugins` label via `usePlugins`.
  - Logo blocks: both shells now use the gradient tile
    (`bg-gradient-to-tr from-primary to-info text-white`, white icon passes as
    graphic ≥3:1) + mono subtitle — user shell `roleSubtitle` computed in
    AppShell (higher role wins: Admin > HR > Team Leader > Control Room >
    Employee), admin shell static `Enterprise`.
  - AdminSidebar converted from collapsible flyout groups to the SAME static
    section labels + flat items (user-delegated decision). Items now render via
    the shared `SidebarNavLink` (deleted the duplicated `renderItem` clone);
    `Extensions` label guarded by `usePlugins` (no orphan label).
    `AdminSidebarFlyout.tsx` + test DELETED; `SidebarNavGroup.tsx` stale
    comment updated. `useAdminNavItems.ts` untouched (`group` data already
    correct). Mockup-only "Team Leader Views" admin group REJECTED (duplicates
    user-shell surfaces; recorded in plan decision 6).
  - `PageShell`: header row `border-b border-line-subtle pb-3` + h1
    `text-2xl font-black tracking-tight` (mockup style; 46 consumers inherit).
  - `HRDashboardStats`: all 4 StatCards got progress bars via existing
    `StatCard` props (Avg OT vs 4h cap, OT-share of Total Requests, static-full
    status bars for Active Teams/Workforce — real ratios, not mockup's
    decorative widths).
  - Plan corrections found during implementation (recorded in plan): keep
    `motion` import in AdminSidebar (root `<motion.aside>` animation), test
    role is `menuitem` not `link` (old flyout test passed vacuously),
    `vi.mock("@/context/PluginContext")` required in SidebarNav + AdminSidebar
    tests (`usePlugins` throws without provider), `section` fixtures typed
    `NavItem[]` (literal widening).
- Verification: full frontend suite 1905/1905 (297 files, +19 new); tsc,
  ESLint (changed dirs), Prettier (touched files), production build clean;
  fallow dead-code: the same 6 documented issues (0 new — flyout deletion left
  no orphans); fallow dupes: no new families (AdminSidebar+Sidebar aside/
  header/footer clones pre-existing; the admin renderItem clone was REMOVED).
  Backend intactness: `manage.py check` clean, `makemigrations --check` "No
  changes detected". Appendix A audit greps: 0 hits (case-sensitive; gradient
  grep scoped to layout/ — SkillsMemberCell chips are the documented
  exception).
- NOTE: the git repo has NO commits (branch `master`, everything untracked) —
  no baseline diff was possible; fallow baseline from AGENTS.md 2026-09-03 was
  used as the comparison point.
- Visual review PASS (live Playwright captures,
  `design-audit/theme-refactor/fidelity-live/`, 6 shots, temp script removed):
  tl-dashboard dark+light, tl-overtime, employee-dashboard, admin-users,
  admin-dashboard — section labels (CORE OPS/LEADERSHIP/SKILLS & KPI/SYSTEM;
  admin OVERVIEW/PEOPLE/OPERATIONS), gradient tiles, role subtitles (HR for
  the HR+TL multi-role user per higher-role-wins; EMPLOYEE; ENTERPRISE),
  PageShell header borders, KPI bars on all 4 HR cards, employee PLUGINS
  label for injected items, no Leadership section for employees, admin flat
  sections with no flyout chevrons. Light mode mirrors correctly. User's
  post-implementation Prettier/tailwind-class-order reformats verified green
  (97/97 targeted, Prettier clean).
- Fidelity extension (same session): 5 custom-header pages that don't use
  PageShell got the same mockup treatment (`border-b border-line-subtle pb-3`
  + `text-2xl font-black tracking-tight`): TeamLeaderDashboardHeader,
  PluginManagementPage, NotificationsPage, CalendarManagementPage (dropped the
  last `sm:text-4xl`), OrganigramaPage. TDD: 4 new/extended test files
  (TeamLeaderDashboardHeader.test, PluginManagementPage.test new;
  NotificationsPage.modernization + OrganigramaPage.test extended) — 4 red →
  11/11 green. CalendarManagementPage covered by grep gate (render test
  disproportionate). Spec-wins skips: CalendarHeader h1 is the month-nav
  toolbar title (restructuring risks the calendar plan's tested treatments),
  LoginPage brand mark, DashboardEmptyState heading — none are page headers.
  Mobile 375px verification: 5 captures (TL dashboard dark+light-mobile,
  TL overtime, employee dashboard, admin users), horizontal overflowPx=0 on
  all. Live header captures for the 5 fixed pages in
  `design-audit/theme-refactor/fidelity-live/header-*.jpg` — borders +
  font-black confirmed. Final: full suite 1909/1909 (299 files, +4); tsc/
  ESLint/Prettier clean; fallow 6 documented (temp capture scripts removed).

## Current session outcome — 2026-09-03 (theme refactor review)

- Independent review of the Obsidian-Slate implementation
  (`plan-obsidian-slate-theme-refactor-2026-09-02.md`): token remap, tailwind
  mappings, fonts, and all 4 primitives verified exact against the spec; audit
  greps clean; do-not-touch list intact. Full frontend suite re-run
  independently: 1886/1886 (298 files); tsc/ESLint/Prettier/build clean; fonts
  bundled (15 woff2). Visual review of `design-screenshots/` (268 captures,
  4 dirs × 67): dark pages match the mockup ramp (body #07090E, sunken
  sidebar, panel cards, mono numerals, violet nav, blue today-glow); light +
  mobile spot-checks clean, no overflow.
- User hand-edit: skills grid headers (Matrix/Dense/Heatmap) changed
  `bg-card` → `bg-muted shadow-sm` and dropped `accent.bg` from category
  super-headers (accent now text + `border-l-*-500/30` only). Updated the 2
  pinned "applies category accent classes" tests to pin the new design.
  Focused: 3 grid test files 88/88; Prettier clean.
- Non-blocking notes: `AdminSidebar.tsx:125` still `bg-card/70` (subtle
  difference over the dark body; one-line swap if parity wanted); two
  skeleton placeholders still `bg-card/90` (AnalyticsMetrics, StatsWidgets);
  primitive class swaps unpinned by component tests (CSS layer is pinned by
  `tokens.test.ts`).
- Review follow-up (same session, user-approved): `AdminSidebar` surface →
  `bg-surface-sunken` (parity with TL Sidebar); AnalyticsMetrics + StatsWidgets
  skeletons → opaque `bg-card`. Focused: AdminSidebar/analytics/dashboard-widgets
  71/71; Prettier clean; fallow dead-code back to the 6 documented issues
  (temp capture script removed); fallow dupes: no new families from theme work
  (8.8% repo-wide is pre-existing nav/test-mock clones). Layout comparison vs
  mockups (live dark captures, design-audit/theme-refactor/live-check/):
  structure matches (sidebar + KPI row + 8/4 grid + table card); mockup-only
  details not adopted: page-header bottom border, KPI progress bars/subtext,
  sidebar nav group labels — app sidebar footer is a functional superset
  (theme toggle, Install app, Logout).

## Current session outcome — 2026-09-02

- Dev settings fix: `config/settings.py` (the DEV module used by
  `manage.py`/`wsgi`/`asgi`) had production-style guards added that defaulted
  `DEBUG` to False and raised when `SECRET_KEY` was unset — breaking the
  documented `python manage.py runserver` workflow. Restored dev defaults
  (`DEBUG` defaults True, insecure dev key, localhost ALLOWED_HOSTS fallback);
  production enforcement remains in `config/settings_production.py` (untouched).
- Skills Matrix UI/UX refactor implemented under TDD per
  `~/.devin/plans/plan-9f2ce595bfcd7ba8.md` (reference:
  `Skills Matrix UI Refactor.html` — visual mock only; raw hex/slate/fonts
  NOT adopted, semantic tokens only):
  - Backend: `build_matrix_rows` + `TeamMatrixRowSerializer` now include
    `full_name` (falls back to username; no job-title field exists in the
    user model). No migrations, no permission changes.
  - New shared pieces: `utils/skillKpis.ts` (pure KPI selectors),
    `utils/categoryAccents.ts` (`categoryAccent()` hash → 5 accent families,
    `avgTone()`), `components/SkillsKpiCards.tsx` (4 StatCard-based KPI
    cards: Seniority Index, Strongest Domain, Critical Gap, Verification
    Rate — all computed client-side from existing coverage/gap/matrix data,
    no new endpoints), `components/SkillsLevelLegend.tsx` (single legend,
    rendered once on the Team page for all modes), and
    `components/SkillsMemberCell.tsx` (initials avatar + full name +
    `@username` subtitle).
  - `SkillsMatrixTable`: member cell uses `SkillsMemberCell`; crosshair
    row/column hover (`bg-foreground/5` rows, `bg-foreground/10` headers —
    mouse-only, never touches focus/ARIA); category super-header accent
    tints; Avg values color-toned via `avgTone()`; unrated cells render a
    hollow dot (was em dash); title is "Team Skills & Capability Engine".
  - `SkillsTeamToolbar`: member count badge restyled (emerald pill +
    pulsing dot). NOTE: no `role="status"` on it — it conflicted with the
    SkillsScaleHint status-role assertions; static `aria-label` instead.
  - `SkillsDenseMatrix`: hybrid cells — 5-segment `TickBar` (filled segments
    use `levelDot()`) + `L{n}` label; same `levelColor()` cell contract,
    aria-labels, and virtualizer invariants; crosshair hover added.
  - `SkillsHeatmapGrid`: inline legend removed (page-level shared legend
    covers all modes).
  - `RateSkillDialog`: "+1 Level (L{n+1})" quick action added (hidden at L5,
    disabled while pending).
  - `MySkillsPage`: 4-card stats row (added Average level + Strongest skill;
    "at-target" is not computable — `target_level` was removed) and a 5-dot
    `LevelDots` indicator per skill row. `SkillsHistoryPage`: "Created"
    label for `old_level === null` entries (was a dangling arrow).
- Verification: skills focused 344/344 (+28 new); full frontend 1853/1853
  (293 files); backend `plugins.skills` 106/106; tsc, ESLint (only the
  pre-existing TanStack `incompatible-library` warnings), Prettier, and
  production build clean; Django check, Ruff, `makemigrations --check` clean.
- E2E verification (Playwright, dev servers :8000/:5173, `seed_e2e_data`):
  skills.spec.ts 9/10 passed (the 1 failure is the anon login throttle
  tripping mid-run — environment flake, same test passed on the other
  project). Fixed a latent e2e spec bug: `apiRequest` read
  `localStorage.getItem("access_token")` but the SPA keeps the JWT access
  token IN MEMORY ONLY (`lib/api.ts`) — helpers now authenticate via the
  public `/api/auth/token/` endpoint with `page.request`. Fixed a real a11y
  bug the run exposed: the matrix grid's `aria-label` was on the scroll
  wrapper div, not the `role="grid"` table, so the grid had no accessible
  name — moved onto the table. Verified in-browser: KPI cards, legend,
  avatar+full-name member cells, category accents, Dense tick bars, and no
  horizontal overflow at 320px (both projects). Member enrichment extended
  to List view + mobile member cards (`SkillsMemberCell` reused) — closing
  the username-only inconsistency.
- Ops notes for e2e runs: (1) repeated runs exhaust the DRF anon throttle
  (100/hour per IP) — UI logins then 429/timeout until the window resets;
  restarting the runserver process clears the LocMemCache throttle. (2)
  Killing the shell does NOT kill the runserver child on Windows — check
  `netstat -ano | findstr :8000` for orphaned PIDs or a second bind steals
  traffic with stale in-memory state.
- Skills Matrix v2 visual pass implemented under TDD per the junior-proof
  spec in `~/.devin/plans/plan-9f2ce595bfcd7ba8.md` (user decision: the §2
  global token remap is DEFERRED to the Calendar plan — all v2 styling uses
  existing tokens only):
  - `proficiencyLevels.ts`: L1 red→rose, all level borders /30→/40 (L5 /50 +
    bg /20) — mockup glow badges; `avgTone()` bucket 1 red→rose.
  - `SkillsMemberCell`: gradient avatar chips (8 `from-X-500 to-Y-600`
    pairs, deterministic by user_id, slate excluded) + new `compact` variant
    (single truncated line, title carries `name (@username)`) for h-7 grid
    rows.
  - Dense + Heatmap: `MEMBER_COL_WIDTH` 160→176, member col `w-40`→`w-44`,
    compact member cells (fixes Dense name-wrap overflow + Heatmap missing
    avatars), `no-scrollbar`→`skills-scroll` styled scrollbars (new
    `@layer components` block in index.css using existing tokens).
  - Matrix: `skills-scroll`, member cell `py-2`, Avg value `font-mono`.
  - Team page: eyebrow pill ("Skills Matrix · Q3 Team Competency"), desktop
    grids wrapped in a `GlassCard p-0` workspace panel with a footer stats
    bar ("N Team Members Loaded • Click any cell to rate" + active-view
    pill); legend uses its new chip surface (custom className removed).
  - Toolbar segmented control `rounded-xl shadow-inner`; Filters compact
    uppercase header (description removed) + search icon with `pl-9` input;
    KPI values `font-mono`; RateSkillDialog `bg-popover`; MySkills stat
    cards `p-3.5` + `font-mono` values; `SkillsGapSummary` yellow→`warning`
    tokens (pre-existing debt).
  - NEW `python manage.py seed_skills_demo [--seed N] [--coverage F]` —
    deterministic demo ratings (weighted L1–L5, update_or_create). Ran with
    defaults: 118/171 pairs rated (~69%).
- Verification: skills 350/350; full frontend 1859/1859 (294 files); tsc,
  ESLint (2 pre-existing TanStack warnings), Prettier, build clean; Django
  check, Ruff, `makemigrations --check` clean.
- Fallow-driven dedup pass (user request: "no duplicated code"):
  `useSkillsColumnWidth` (ResizeObserver width, ex-dup:1aa2428d 86 lines),
  `useSkillsGridVirtualizer` (virtualizer config + measure/async-focus/
  scroll-clamp effects, ex-dup:a7bb0868 90 lines — the 2026-08-28 overlap
  invariants now live in ONE hook), and `SkillsMemberColumn` (sticky member
  column + `GRID_CELL_HEIGHT`/`GRID_HOVER_HIGHLIGHT`, part of ex-
  dup:704b50b5). Dense's hover state unified to Heatmap's two-state model
  (hoveredRow/hoveredCol). 3-grid clone 321→275 lines (remainder = per-view
  header/cell JSX, documented as intentional). Also fixed: Dense scroll
  container missed the `skills-scroll` swap (spec gap — §4.2 covered Matrix
  only), its stale `no-scrollbar` test, and React-Compiler errors from
  `let`-mutation in `categoryGroupRanges` useMemos (rewritten functionally).
  New tests: useSkillsColumnWidth 4, SkillsMemberColumn 3. Final: skills
  357/357, full suite 1866/1866 (296 files), eslint 0 errors, build clean,
  fallow dead-code: 0 skills issues (13 pre-existing organigrama items),
  validator: known warnings only.
- Calendar & Vacation UI refactor implemented under TDD per the junior-proof
  spec in `~/.devin/plans/plan-6d60679084c70b73.md` (Linear-style token system
  + calendar polish; the §2 global token remap the Skills v2 pass deferred):
  - Token layer: `.dark` remapped to the tinted-slate ramp (#07090E canvas,
    #0D111A panels, #1E2738 borders, #171E2C grid lines, slate-200 foreground);
    light mode mirrored (tinted `220 20% 97%` canvas, white cards, stronger
    borders). NEW tokens both modes: `--card-raised`, `--surface-sunken`,
    `--line-subtle`, `--info` (#2563EB; white-on-info 5.2:1) +
    `--info-foreground`; `.calendar-today-glow` component class; DialogContent
    now `bg-popover` (elevated modals app-wide). Prior WCAG fixes preserved
    (muted-foreground 43%, destructive 48%).
  - Calendar: sunken day-cell wells + `line-subtle` borders, weekend/
    prev-month dimming, today cell = info badge + "TODAY" tag + radial glow,
    "+ Book" hover affordance (aria-hidden, pointer-events-none), font-mono
    weekday headers. `calendarStyles.ts` tones rewritten (5 fields: surface/
    title/meta/chip/badge; dark `*-950/40 + *-500/30 + *-300` pattern; ListView
    derives automatically). EventTooltip glass + duration badge + notes well;
    EventCard initials chips. Small-text rule: blue accents are
    `text-blue-700 dark:text-blue-400` (never `text-info` on dark wells);
    snapshot/member labels use `-700 light / -400 dark` palette pattern.
  - Features: `CalendarSnapshotCard` (remaining/total, % left, segmented
    success/warning/destructive bar, aria-label; desktop sidebar only, hidden
    when collapsed), per-member "Xd remaining" from the already-fetched
    `teamBalances` (`memberRemainingDays` Map in `useCalendarPageData`; hidden
    for employees), raised sidebar member cards, tokenized modal internals
    (StatCard/CarryOverCard/CurrentYearCard/UpcomingHolidays/MetricBar),
    ConflictCard + EventActionButtons white-alpha debt cleared, booking dialog
    uses shared `Textarea`, `admin/StatusBadge.tsx` → semantic tokens.
  - designlang evidence: `design-audit/calendar-refactor/` — capture.mjs
    (token-pregeneration + refresh interception, theme-forced; admin→TL role
    swap: admin has no workspaces), audit.mjs (forbidden-pattern gate),
    baseline/ + after/ (8 PNGs each) + tokens-*.json + report.md. Computed
    dark body = rgb(7,9,14) exactly per spec. Violet+blue design check: KEEP
    dual-accent (no clash; violet=identity, blue=temporal).
- Calendar verification: focused calendar 112/112 (+14 new: T1 5, T2 5, T3 2,
  T4 2); full frontend 1880/1880 (297 files); tsc, ESLint (2 pre-existing
  skills warnings), build clean; audit.mjs PASS (17 baseline violations → 0);
  fallow: no new issues (4 pre-existing). Prettier: calendar files clean
  (~42 pre-existing non-calendar warnings remain). Follow-ups recorded in
  report.md: admin StatusBadge light contrast (~2:1, app-wide pattern debt),
  `skills-scroll` CSS block missing from index.css (skills domain).
- Calendar follow-up batch (same day): (1) responsive verification with
  fresh-context per width (`responsive-check.mjs`) — 375px defaults to List,
  768/1280/1920 month grid, zero horizontal overflow; fixed the "TODAY" tag
  clipping at 375px month view (`hidden sm:inline`). (2) StatusBadge light-mode
  AA fix applied to BOTH `ui/StatusBadge.tsx` and `admin/StatusBadge.tsx`
  (`text-amber-700/-emerald-700/-rose-700` light, semantic token dark;
  `text-warning`-on-white was ≈2:1) with a pinned test. (3) `skills-scroll`
  CSS block added to index.css (was referenced by all 3 skills grids but never
  defined). Final: full suite 1881/1881, tsc, prettier, build clean.

## Current session outcome — 2026-08-28

- Skills heatmap full-width fix: measured the available viewport and synchronized
  the responsive skill-column width across the virtualizer, headers, body area,
  and virtual columns; added a regression test for the full-width surface.
- Skills heatmap column overlap fix: the virtualizer cached the initial 64px
  `estimateSize` and never recomputed when `skillColWidth` changed (ResizeObserver
  set it to the responsive width, e.g. 218px). `virtualItem.start` kept the stale
  64px spacing, so body columns were positioned 64px apart while being 218px wide
  — causing the "5 cells stacked together" overlap. Fix: (1) compute `left` from
  `virtualItem.index * skillColWidth` instead of `virtualItem.start`, and (2) call
  `virtualizer.measure()` in a `useEffect` on `skillColWidth` change to invalidate
  the size cache. Updated the test mock to simulate stale cache spacing (100px
  `start` vs 64px `skillColWidth`) and added regression tests for both the
  positioning and the `measure()` call.
- Skills large-scale optimization (Dense Matrix + Scale Hint) implemented
  2026-08-28 under
  `.devin/plans/plan-skills-large-scale-optimization-2026-08-28.md`:
  - Extracted shared `SkillsViewMode = "matrix" | "dense" | "heatmap" | "list"`
    type in `types/skills.ts`; replaced 4 inline unions in toolbar + page.
  - New `SkillsDenseMatrix` component: virtualized div-grid with `L{level}`
    text cells (Matrix pattern) + `levelColor()` fill. Reuses the Heatmap
    virtualizer architecture (column virtualization, `scrollMargin: 160`,
    `left: index * skillColWidth`, `measure()` on resize, sticky headers +
    member column outside the virtualizer, `useGridKeyboardNav` with
    `scrollToIndex` + async focus). No hover highlighting, no legend. Mobile
    falls back to `SkillsMemberCard`. Cell color contract: `levelColor()` +
    `L{level}` text + `levelLabel` title — never `levelHeat()` + white text
    (fails WCAG AA on 400-level fills). Rated cells use `border` (not
    `border-transparent`) so `levelColor()`'s border color applies cleanly.
  - New `SkillsScaleHint` component: dismissible `role="status"` banner
    between toolbar and filters. Shows only when `!isMobile && skillCount >
30 && viewMode === "matrix"`. `isMobile` gate lives IN the component.
    Dismissal is component-local state (not persisted — reappears on reload).
  - Toolbar updated: 4 view-mode buttons (Matrix | Dense | Heatmap | List)
    with `LayoutGrid` icon for Dense; `flex-wrap` added to the button group
    for narrow-width layout (4 buttons ≈ 380px overflow 320px viewport).
  - Phase 3 (heatmap header virtualization) deferred by user decision —
    design + pitfalls recorded in plan §8 for a follow-up session.
- Verification: focused Skills tests 314/314 (was 255, +59 new); TypeScript,
  ESLint (only the pre-existing TanStack `incompatible-library` warning, now
  on both Heatmap and Dense), Prettier, and production build clean. Full
  frontend suite + fallow dead-code/dupes pending final verification pass.
- No Python or Node.js servers remain running after verification.
- designlang reference extraction completed for Flair Matrix Table and shadcn Team
  Member Skills Matrix; notes and generated token/responsive artifacts are in
  the ignored `design-audit/heatmap-references/` directory.
- Matrix header transparency fix: `SkillsMatrixTable` `<thead>` and sticky
  `<th>` cells changed from `bg-muted/50` to `bg-muted/90 backdrop-blur-sm`
  to match Dense/Heatmap grids. Body rows no longer bleed through the sticky
  header when scrolling.
- Skills catalog admin GUI modernized using `designlang` token extraction
  (shadcn dashboard-01 reference):
  - `SkillsCatalogWorkspace`: category sidebar with `FolderTree` icon header,
    `Badge` skill counts, `ring-1 ring-primary/20` selection, animated chevron,
    hover-reveal edit button; skill table uses `Switch` + `Badge` for status
    (replacing plain click-button); active/inactive dot indicators in stats bar;
    icon-centered empty state with CTA; dedicated mobile card list (`sm:hidden`).
  - `SkillCategoryDialog` + `SkillFormDialog`: `DialogDescription` added,
    native checkbox replaced with `Switch`, bordered active toggle row with
    description text, helper text under Name field, improved spacing.
  - `SkillsCatalogPage`: 4-card stats summary (categories, total, active,
    inactive) with `tabular-nums`; filter bar upgraded to `rounded-xl` with
    `backdrop-blur-sm`.
  - All new styling uses existing semantic tokens — no raw hex or gray/zinc.
- Design verification: `designlang` extraction of live authenticated Skills
  Team page scored 100/100 (Grade A) across all categories. Responsive
  behavior verified at 375px, 768px, 1280px, 1920px via Playwright DOM
  inspection — mobile correctly falls back to `SkillsMemberCard`, desktop
  grids render with no horizontal overflow, toolbar wraps 2×2 on mobile.
- Final verification: full frontend suite 1750/1750 (252 files); TypeScript,
  ESLint, Prettier, and production build clean. Skills subset: 316/316.
- Design review and contrast fixes: active status badge changed from
  `text-emerald-700`/`bg-emerald-500/10` (2.16:1 FAIL) to
  `text-emerald-800`/`bg-emerald-600/15` (AA pass); selected category text
  and "N selected" pill changed from `text-primary` on `bg-primary/10` (1:1)
  to `text-foreground` (17.87:1). Dark mode verified AA-passing.
- Codebase cleanup: `fallow dead-code` reduced from 39 issues to 0.
  Removed dead `SkillsAdminSidebarItem.tsx` + test (sidebar uses
  `useAdminNavItems.ts`), removed unused `useDeleteSkill` export. Removed
  8 unused `export default` declarations (named exports retained). Removed
  truly unused `clsx` dependency. Restored `dompurify` and `tailwind-merge`
  (fallow `--production` false positive — used in `sanitizeHtml.ts` and
  `utils.ts`). Updated `.fallowrc.json` with test-only export suppressions.
  Design-audit directory cleaned: 4258 files / 23.3 MB → 252 files / 7.8 MB
  (deleted 98 old prompt directories + 3400 loose designlang artifacts).
- Post-cleanup verification: 1745/1745 tests (251 files, -5 from removed
  SkillsAdminSidebarItem test); TypeScript, ESLint, Prettier, build clean.

## Current session outcome — 2026-08-29

- External AI review audited and triaged. Of 5 "High Priority Dangerous
  Findings," 1 was real (with a wrong proposed fix), 2 were real but
  minor, 2 were false/mischaracterized. 3 confirmed-real fixes
  implemented under TDD per
  `.devin/plans/plan-review-followups-2026-08-29.md`.
- Fix A — `activate_plugin` lifecycle gap (`core/plugins/registry.py`):
  `ready()` failure now calls `plugin.disable()` to tear down partially
  connected signal handlers before rolling back `is_enabled=False`. The
  reviewer's proposed `transaction.atomic()` was rejected — `atomic()`
  rolls back DB writes only, not in-memory signal registrations.
  Regression test:
  `test_activation_ready_failure_calls_disable_to_clean_partial_signals`
  in `apps/plugins/tests.py`.
- Fix B — `BulkSkillAddDialog` unstable React key: `key={index}` replaced
  with stable per-row `id` (via `useRef` counter). `Row` type now has
  `id: number`; `key`, `id`, `htmlFor`, `updateRow`, and the remove
  filter all use `row.id`. Regression test: `preserves stable input ids
  when a middle row is removed`.
- Fix C — e2e skills seed (`frontend/e2e/skills.spec.ts`): removed
  `code`, `display_order`, `target_level` from seed payloads (serializer
  auto-generates code, ignores the rest); category lookup changed from
  `c.code === "e2e_backend"` (broken — stored code is `"E2E BACKEND"`)
  to `c.name.toUpperCase() === "E2E BACKEND"`. Verified by inspection
  (Playwright cannot run per known issue).
- Rejected findings (no action): disabled plugins in registry is correct
  design; control_room special handling is authorization scoping not
  dependency; permission manifest `reset` IS used via
  `seed_plugin_permissions --reset`; `display_order` has no schema drift
  (model + migration consistent).
- Verification: backend `apps.plugins` + `plugins.skills` 159/159;
  `check`, Ruff, `makemigrations --check` clean. Frontend
  `src/plugins/skills` 312/312 (27 files, +1 new test); TypeScript,
  ESLint, Prettier, production build clean.
- `display_order` dead-column cleanup (plan P3/P4): removed the field
  from `SkillCategory` and `Skill` models; generated migration
  `0005_remove_skill_display_order_and_more.py`; removed the stale
  `test_models.py:22` assertion; updated `04-skills.md` "Catalog form
  fields" note. Verified: `makemigrations --check` clean, 159/159
  backend tests pass. The second external review's "REQUIRED FIX before
  merge" framing was rejected — there was no schema drift or regression;
  this was a cleanup, not a bugfix.
- Layout modernization Phase 1 (shared components) implemented under TDD
  per `.devin/plans/plan-layout-modernization-2026-08-29.md` §6 Phase 1:
  - `EmptyState.tsx` (NEW, `components/ui/`): icon-centered empty state
    (muted circle icon, title, optional description, optional CTA slot),
    semantic tokens only. 3 tests.
  - `DataTable.tsx`: thead surface `bg-muted/40` → `bg-muted/90
    backdrop-blur-sm` (opaque blurred header; viewport/dividers/hover
    already compliant). Regression test added.
  - `StatCard.tsx`: value now `tabular-nums`; new optional
    `statusDotLabel`/`statusDotClassName` render `role="status"` dot
    (default `bg-success`). Backward compatible. 4 tests.
  - `BulkActionBar.tsx`: GlassCard `isHoverLift={false}` (flat selection
    bar). 2 tests.
  - `SwitchField.tsx` (NEW, `components/common/forms/`): canonical
    bordered toggle row — `Label htmlFor` + Switch + description in
    `rounded-lg border border-border/70 p-3`. 4 tests.
  - Verification: `vitest src/components` 405/405 (68 files); full suite
    1760/1760 (254 files); tsc, ESLint, Prettier, token sweep clean. No
    business logic, permissions, or API contracts touched.
  - Pre-existing token debt noted for Phases 2/3: `StatusBadge.tsx`
    slate tints, `useWorkspaceData.ts` hex fallback.
- Layout modernization Phase 2 (core domain pages) implemented under TDD
  per plan §6 Phase 2. Baseline audit: designlang `score` against live
  authenticated pages (dev servers :8000/:5173, `seed_e2e_data`,
  storageState via `frontend/e2e/login-storage.mjs`, artifacts in
  `design-audit/baseline/`) — all Phase 2 pages 100/100 Grade A before
  and after.
  - Overtime: `OvertimeSummaryCards` → shared `ui/StatCard` (was
    `dashboard/StatCard` with raw gradient tints); `HoursLogExportButtons`
    action row `flex-wrap`. `StatCardProps` now exported.
  - Standby: `WeeklyGeneratorDialog` — "Weekend 24h" checkbox → shared
    `SwitchField` (payload `weekend_24h` unchanged); client checkboxes
    labeled via `Label htmlFor`; preview thead `bg-muted/90
    backdrop-blur-sm`; weekend tint `bg-warning/10` +
    `text-amber-700 dark:text-amber-400`.
  - Leave: reject-dialog native input → `Input`; native textarea →
    `Textarea`; `LeaveStatsCards` → `ui/StatCard` (fixes dead
    `text-icon-leave`/`text-icon-info` classes); Type icon token fixed.
  - Team: reject input → `Input`; `TeamFilterBar` flat GlassCard +
    wrapping date row; `TeamGroupedTables` empty state → shared
    `EmptyState` (no CTA — no create gate exists); `TeamOverviewCard`
    `tabular-nums` + AA tints (`-700` light / `-400` dark); 
    `TeamBulkOperationsPanel` count `text-foreground` + flat GlassCard.
  - Admin HoursLogs: `StatsCards` → `ui/StatCard` (old admin StatCard
    now unreferenced — removal deferred to Phase 7 dead-code pass);
    filter-bar + table GlassCards normalized to canonical `p-4`.
  - Verification: Phase 2 dirs 87/87; full suite 1779/1779 (263 files,
    +19 tests/+9 files); tsc, ESLint, Prettier, token sweep clean. No
    business logic/permissions/API contracts touched.
- Layout modernization Phase 3 (admin pages) implemented under TDD per
  plan §6 Phase 3. Baseline audit: all 15 admin URLs 100/100 Grade A
  (designlang `score`, authenticated, pre and post).
  - Stat cards → shared `ui/StatCard`: `UserStatsCards` (was gradient +
    `bg-black/30` + light-invisible `-300` tints), `AuditLogStatsCards`
    (was `amber-600`/`blue-500/40`), `StatsWidgets` (admin dashboard
    tiles), `LeaveRequestsPage` Vacation/Sick cards (was old admin
    `components/StatCard`). `ui/StatCard` gained optional `trend` prop;
    value wrapper `p`→`div` (valid HTML for block values).
  - Switch conversions (payload identical): `FormRoleCheckboxes`
    (HR/IT TL/AL TL/CR Admin) and `HolidayFormDialog.is_global` →
    `SwitchField`; tests updated to `role="switch"` assertions.
  - Empty states → shared `EmptyState`: TechsPage, AuditLogsEnhancedPage,
    PluginManagementGrid, ResourceAccessPage (local copy deleted),
    ResourceAccessMemberList.
  - GlassCard normalization: LeaveRequests filter bar + table,
    TechsPage form, PluginManagementGrid (Card→GlassCard),
    TeamsTable + CalendarGroup* cards (Card rounded-3xl → flat
    GlassCard), CalendarManagementPage 3 panels.
  - AA tint fixes: useUserColumns TL/CR chips, useAuditLogColumns
    action pills, ManageTeamsDialog diff chips (all with dark variants).
  - Verification: admin suites 236/236; full suite 1783/1783 (265 files,
    +4 tests/+2 files); tsc, ESLint, Prettier, token sweep clean. No
    backend deps (all stats reuse fetched data). Servers stopped.
- Layout modernization Phase 4 (dashboard/HR/settings/login/calendar shell)
  implemented under TDD per plan §6 Phase 4. Baseline and post-change
  designlang scores: 100/100 Grade A across 13 authenticated/public role
  views (login, admin/employee/HR dashboards, HR reports, settings,
  calendar).
  - Login: semantic `bg-background`, mobile padding, reduced-motion-safe
    Framer entry animation.
  - Personal + HR dashboards: copied Card/gradient surfaces converged on
    shared `StatCard`/`GlassCard`/`EmptyState`; numeric values use
    `tabular-nums`; pending/empty states are icon-centered; labeled status
    dot preserved for `HRDashboardPendingLeave`.
  - HR reports: flat padded filter GlassCard, semantic export action colors,
    shared empty state, semantic ranking palette and tabular hours.
  - Settings: notification channels use bordered `SwitchField` rows with
    descriptions and explicit accessible names. CR-only and CR-scoped gates
    for My Clients/notifications remain unchanged; multi-select My Clients
    checkboxes remain checkboxes.
  - Calendar: workspace-selection prompt and partial-workspace warning use
    shared semantic surfaces; `useValidWorkspaceIds`, workspace defaults,
    and query logic untouched.
  - Verification: Phase 4 focused suite 90/90 (27 files); full suite
    1794/1794 (275 files); tsc, ESLint, Prettier, build, and token sweep
    clean. Fallow duplicates remain pre-existing (8,533 lines / 8.9%);
    temporary auth helper removed. No backend dependencies or business
    logic changes; old admin StatCard remains deferred to Phase 7.
- Layout modernization Phase 5 (analytics/control-room/data-import/
  notifications) implemented under TDD per plan §6 Phase 5.
  - Baseline and post-change designlang scores: all five plugin routes
    100/100 Grade A (authenticated admin).
  - Analytics: chart parent-height regression guard added; existing
    `h-[280px]` chart surfaces retained. Analytics insights, hotspots,
    scheduled-report, and export status colors converged to semantic tokens;
    chart colors/data/export behavior unchanged.
  - Control Room: empty state migrated to shared `GlassCard` + `EmptyState`;
    access and bulk-scope warnings/status colors use semantic tokens. CR
    scoping, query keys, render surfaces, and explicit empty-scope semantics
    untouched.
  - Data Import: dropzone, target picker, mapping/transforms/options,
    history, and preview tables use GlassCard; preview statuses/warnings
    use semantic tokens; wizard steps/action row wrap responsively. Import
    state/profile/save/commit logic untouched.
  - Notifications: list/filter surface uses GlassCard and empty results use
    shared EmptyState; mark-read and mark-all-read behavior unchanged.
  - Verification: plugin suites 198/198 (39 files); full suite 1801/1801
    (282 files); tsc, ESLint, Prettier, build, and token sweep clean. No
    backend dependencies, service BASE changes, query-key changes, or
    business logic changes. Fallow deferred to Phase 7.
- Layout modernization Phase 6 (organigrama/payroll/ticket-KPI) implemented
  under TDD per plan §6 Phase 6. Baseline and post-change designlang scores:
  all 14 audited admin/app routes 100/100 Grade A.
  - Organigrama admin filter toolbar now uses flat GlassCard; empty chart
    results use shared EmptyState with create CTA; featured star uses the
    semantic warning token. React Flow/tree/publish/audience behavior is
    unchanged. Removed one unused pre-existing `memo` import in OrgNode.
  - Payroll settings boolean fields and superseded-rule-set toggle use
    bordered SwitchField rows with descriptions; rule-set/run status and
    draft closure surfaces use semantic tokens/GlassCard. Payroll lifecycle,
    finalization guards, PayrollRunEntry semantics, and payloads unchanged.
  - Ticket KPI team Member Breakdown now uses GlassCard; team KPI query,
    export, navigation, upload, and evidence behavior unchanged.
  - Verification: organigrama/payroll/ticket-KPI suites 265/265; full suite
    1803/1803 (283 files); tsc, ESLint, Prettier, and production build clean.
    No backend dependencies, migrations, service URL/query-key changes, or
    permission/business-logic changes. Fallow deferred to Phase 7.
- Layout modernization Phase 7 final verification completed 2026-08-30.
  - Full frontend suite: 1803/1803; tsc clean; production build clean;
    full ESLint clean except two known Skills TanStack Virtual warnings.
  - Fallow dead-code: 4 known pre-existing issues (old admin StatCard,
    CardFooter export, documented dompurify/tailwind-merge false positives).
    Fallow dupes: 308 clone groups, 8,515 duplicated lines / 8.85% across
    178 files; no unrelated cleanup applied.
  - Final designlang sweep: all recorded Phase 2–6 page groups remained
    100/100 Grade A. All changed files are Prettier-clean; the repository
    still has 40 known pre-existing formatting warnings.
  - Durable `EmptyState` and `SwitchField` contracts recorded in
    `.devin/context/03-FRONTEND-PATTERNS.md`. Plan status is COMPLETE.

## Production and security status

The production security plan is complete except explicitly deferred items:
admin hardening and out-of-scope observability/WAF work. Current security and
dependency checks were recorded as clean in the prior session logs. Preserve
least privilege, server-side authorization, business-day leave calculations,
monthly OT/standby locks, payroll entry guards, calendar privacy, and plugin
render-surface authorization.

## History and references

- Detailed entries rotated from this file are in
  `.devin/tracking/agents-archive-2026-08-26.md`.
- Older session archives are under `.devin/tracking/` and should be loaded only
  for historical questions.
- Durable invariants belong in `.devin/context/`; do not duplicate them here.

## Current session outcome — 2026-08-30 (layout audit follow-up)

- External layout-modernization audit triaged: 7 issues → 3 real, 2 false,
  1 downstream, 1 out of scope.
- GAP 2 fix: `AnalyticsMetrics.tsx` migrated from old
  `components/dashboard/StatCard` (raw `text-emerald-500`/`amber-500`/
  `rose-500`, no `tabular-nums`) to shared `components/ui/StatCard` with
  `AnimatedNumber` value, semantic `glow` + `iconColorClass`
  (`text-success`/`text-warning`), `tabular-nums`. Also resolves GAP 6
  (raw 500-level tints no longer reach production via this path).
- GAP 3 fix: `HolidayTable.tsx` empty state + table wrapper `rounded-3xl`
  → flat `GlassCard` (`isHoverLift={false}`).
- GAP 4 fix: deleted unreferenced dead code
  `pages/admin/components/StatCard.tsx`.
- GAP 1 and GAP 5 rejected: both misapplied the §2.3 sticky-only header
  rule (`bg-muted/90 backdrop-blur-sm`) to non-sticky headers. None of the
  5 flagged files use `position: sticky`. The Skills gold standard itself
  uses `bg-muted/40` for non-sticky headers
  (`SkillsCatalogWorkspace.tsx:325`) and `bg-muted/90 backdrop-blur-sm`
  only for sticky ones (`SkillsMatrixTable.tsx:63`).
- Tests added: 5 new (all red→green) —
  `AnalyticsMetrics.modernization.test.tsx` (2),
  `HolidayTable.modernization.test.tsx` (3).
- Verification: focused 96/96 (25 files); TypeScript, ESLint, Prettier,
  production build clean. No business logic changed.

## Current session outcome — 2026-08-30 (senior audit of layout modernization)

- Independent senior audit of plan-layout-modernization-2026-08-29.md:
  every §6 claim verified against code (no git history; claim-vs-code).
  Baseline matched all claims exactly: 1808/1808 (285 files), tsc clean,
  ESLint 2 known Skills warnings, Prettier 40 documented warnings, build
  clean, fallow dead-code 4 documented issues.
- REAL BUG fixed (WCAG AA): `ConflictCard.tsx` (calendar conflicts modal)
  used dark-only `text-emerald-300/rose-300/amber-300/indigo-400` badges on
  light-mode `/15` backgrounds (1.33:1 FAIL) + raw `bg-white/50`. Fixed to
  canonical `-800` light / `-400` dark pattern (6.31–9.62:1). New
  `ConflictCard.test.tsx` (3 tests).
- FALSE CLAIM fixed (Phase 4 partial): TL dashboard components never
  migrated. `TLStatsCards` (5 bare Cards, inline glass imitation
  `bg-card/50 backdrop-blur-xl`, raw gradient overlays, no tabular-nums,
  `text-muted-foreground/60`) → shared `ui/StatCard` with
  `text-accent-*` token icons. `TopBottlenecksCard`, `QueueMixCard`,
  `MonthlyComparisonCard`, `PersonalDashboardLeavesCard` → GlassCard;
  QueueMix 1:1 `text-primary`-on-`bg-primary/10` badge → `text-foreground`;
  TopBottlenecks badge → `red-700 dark:red-400` (AA);
  `useTeamLeaderDashboardUI` accents → `bg-warning`/`bg-success` (hook test
  expectation updated for the token change).
- GAP fixed: `VacationReport.tsx` raw green/orange classes →
  `border-t-success`/`bg-success/5`/`border-l-warning` + AA
  `emerald-800/400`/`amber-700/400` + `tabular-nums`. New modernization
  test (2).
- GAP fixed (§2.4): removed `opacity-60` from `ReportsPage` pre-generation
  GlassCard (admin twin of the Phase 4 HR fix) and `TechMultiSelect`
  "(inactive)" muted text.
- Dead code: deleted `components/dashboard/StatCard.tsx` (unreferenced after
  GAP 2 migration; fallow-confirmed).
- Clean sweeps: 0 native checkboxes, 0 sticky `bg-muted/50`, 0
  `text-primary` on `bg-primary/10`, 0 `rounded-3xl` outside calendar,
  0 old dashboard/StatCard consumers. 38 residual shadcn `Card` imports
  classified — most are compliant GlassCard-container hybrids.
- Explicitly deferred debt (see plan §6 "Senior audit"): calendar body
  components (UserStatusModal, CarryOverCard, CurrentYearCard,
  UpcomingHolidays, local calendar/StatCard duplicate, CalendarBottomCards
  CarryOverCard duplicate), StatusBadge slate tints, organigrama
  BuilderNode/CustomChartViewer slate, useWorkspaceData hex fallback,
  ticket_kpi bare-Card containers.
- Tests: +11 new (red→green). Full suite 1819/1819 (289 files); tsc, ESLint
  (changed paths), Prettier (changed files), production build clean. No
  business logic, permissions, API contracts, or query keys touched.

## Current session outcome — 2026-08-31 (external audit gap closure)

- Independently rechecked the external audit against the plan and source.
  Confirmed real gaps: Ticket KPI `KPICard` was not using shared `ui/StatCard`,
  the dashboard had a local empty-state implementation, the member ticket
  table lacked a `GlassCard`, Resource Access selected groups lacked the
  prescribed selection ring, and the CalendarHeader toolbar was not in a
  `GlassCard`.
- Fixed those presentation-only gaps. `KPICard` now composes `ui/StatCard`
  while preserving delta behavior; ticket dashboard empty state uses shared
  `EmptyState`; the member table is contained by a flat `GlassCard`; selected
  Resource Access desktop/mobile items use `ring-1 ring-primary/20`; and the
  CalendarHeader toolbar uses a flat `GlassCard`.
- Confirmed false/not-required findings: `bg-muted/30` on HolidayTable and
  ReportUserTable is non-sticky and is not covered by the sticky-header `/90`
  rule; the plan explicitly documents `/30`/`/40`/`/50` as valid for non-sticky
  headers. Ticket KPI's other bare Cards remain explicitly deferred debt in
  the plan and were not broadened into this focused follow-up.
- Focused verification: 245/245 tests across admin, calendar, and Ticket KPI;
  TypeScript and changed-path ESLint clean. Final frontend verification:
  1821/1821 tests (289 files), TypeScript clean, production build clean;
  repository Prettier retains 40 documented pre-existing warnings.
- Fallow: dead-code 3 documented issues (CardFooter plus dompurify and
  tailwind-merge false positives); duplication remains pre-existing. State
  validator could not complete because this initial no-commit workspace has a
  quoted XLSX path that the validator passes unescaped to `Path.GetExtension`.

## Current session outcome — 2026-09-01 (frontend design hardening)

- Skills Team page: responsive skill-column sizing is clamped to 80–180px;
  Dense/Heatmap skill headers now use the same horizontal virtualization as
  body cells; mobile member details cap each category at 10 skills with a
  Show all action; and the scale hint can switch directly to Dense or Heatmap.
- Skills UI polish: toolbar/filter surfaces use flat `GlassCard`, empty states
  use shared `EmptyState`, pagination and rating controls meet touch-target
  sizing, sticky spacer headers are opaque, and rating/filter dialogs include
  accessible descriptions.
- Shared and role surfaces: `FormDialog`, `StatusBadge`, `DataTable`, action
  helpers, Settings, employee dashboard, TL, HR, and admin aggregate surfaces
  received semantic status tokens, labels, touch targets, numeric alignment,
  and shared empty-state improvements. Business logic, API contracts, query
  keys, and backend authorization were not changed.
- Live review: authenticated Skills Team page checked at 375, 768, 1280, and
  1920px with no document overflow. The local page rendered 19 members and 8
  skills; large-catalog behavior is covered by virtualization and responsive
  width logic. Related routes were not fully live-reviewed because the
  available browser bridge could not attach to localhost.
- Verification: frontend full suite 1822/1822 (289 files), TypeScript clean,
  production build clean, changed-path Prettier clean. Full ESLint has only
  the two known TanStack Virtual `incompatible-library` warnings. Repository
  Prettier retains the documented pre-existing warnings.

**Last Updated:** 2026-09-01

## Current session outcome — 2026-09-01 (security finding remediation)

- Remediated the reported security findings across permission caching, JWT
  session handling, protected media, upload validation, team traversal,
  profile-less exports, operational logging, and DEBUG defaults.
- Access and refresh token material is no longer persisted in browser
  `localStorage`; refresh uses an HttpOnly cookie and frontend refresh requests
  share one promise so concurrent callers settle together.
- Protected media now requires an authenticated request; path traversal and
  forced-download protections remain in place. Upload signature inspection
  failures now reject closed. Team hierarchy traversal stops on corrupted
  cycles.
- Application permission checks no longer use the Django staff flag in the
  central permission service. Report authorization paths retain their existing
  compatibility behavior pending a broader role-fixture migration.
- Focused frontend TypeScript/auth tests and backend security tests pass.
  Django check, migration check, Ruff, frontend production build, and full
  frontend suite pass. Full backend suite has two pre-existing Ticket KPI
  trend failures (`test_multi_month_upload_builds_trend`,
  `test_trend_returns_data_after_upload`) unrelated to these changes.
- Production CORS credentials are enabled to support the HttpOnly refresh
  cookie. No commit or push was performed.

## Current session outcome — 2026-09-02 (Obsidian-Slate theme refactor)

- Token-layer theme refactor implemented under TDD per
  `.devin/plans/plan-obsidian-slate-theme-refactor-2026-09-02.md`, matching the
  mockup palette in `Time Tracker UI Project/assets/tokens.css` (dark-first;
  light mirrors; zero per-page edits, no override CSS):
  - `frontend/src/index.css`: dark `.dark` surface remap (card `221 38% 8%`,
    popover `221 37% 9%`, card-raised `221 33% 11%`, surface-sunken
    `221 40% 6.5%`, secondary/accent `221 33% 15%`, muted `221 33% 14%`,
    glass-bg tracks card); NEW tokens both modes: `--input-bg` (dark
    `220 40% 6%` / light white), `--border-focus` (dark `219 29% 25%`),
    `--focus` (dark `217 91% 60%` = mockup #3B82F6 blue, light `221 83% 53%`).
    WCAG-pinned values preserved (muted-foreground 43% light, destructive 48%).
  - Fonts: `@fontsource-variable/plus-jakarta-sans` +
    `@fontsource/jetbrains-mono` installed and imported in `index.css`;
    `tailwind.config.js` fontFamily wired (sans = Plus Jakarta Sans Variable,
    mono = JetBrains Mono).
  - `tailwind.config.js` color mappings for `input-bg`, `border-focus`,
    `focus`.
  - Shared primitives: `GlassCard` opaque `bg-card` +
    `hover:border-border-focus`; `Input`/`Textarea` `bg-input-bg` +
    `focus-visible:ring-focus`; `Select` trigger `focus:ring-focus` (trigger
    bg stays transparent — panel-inherited, deliberate deviation);
    `Sidebar` surface `bg-surface-sunken` (#0A0E17); `ui/StatCard` value now
    `font-mono` (JetBrains Mono numerals, mockup parity — ui-ux review P2-1).
  - Deliberately rejected: mockup `--accent:#6366F1` indigo (unused by any
    mockup class) and its `-300` pill text (violates the AA `-700/-400`
    pattern).
- New test `src/theme/tokens.test.ts` (5 tests) pins the remapped ramp, the
  kept exact values, the new tokens in both modes, absence of old values, and
  the WCAG pins. `StatCard.test.tsx` and `CalendarPage.test.tsx` (pinned
  `.bg-card/90` → GlassCard marker) updated alongside the class changes.
- Verification: full frontend suite 1886/1886 (298 files); tsc clean; ESLint
  clean on changed paths; Prettier clean on changed files; production build
  clean; fallow dead-code: 6 pre-existing documented issues, 0 new.
- Visual review (ui-ux subagent + agent-browser, dark priority): PASS — body
  #07090E, card #0D121D, sidebar #0A0E17, input wells #090D15, blue focus
  ring #3B82F6, fonts applied, muted-on-card 6.3:1 AA, placeholder 6.6:1 AA,
  zero overflow at 375/768/1280, light mode sane. Artifacts (baseline + after
  + mockup captures) in gitignored `design-audit/theme-refactor/`. No P0/P1;
  P2s recorded (mono on stat values fixed; h-10 touch targets pre-existing).

## Current session outcome — 2026-09-03 (Employee + TL mockup fidelity pass)

- Audited all 16 unique pages in `Time Tracker UI Project/Employee/` and
  `Time Tracker UI Project/TL/` against the live app (3 parallel read-only
  subagent audits + manual screenshot verification). Confirmed: 11 of 16 are
  already visually consistent (calendar, standby, settings-employee,
  my-skills structure, organigrama, skills-history, skills-matrix,
  pending-approvals, team-overview, hr-reports — RBAC-gated as intended,
  overtime/leave/dashboard structurally matched pre-fix).
- Implemented (cascading, additive, TDD): `StatCard` gained an opt-in
  `progressPercent`/`progressColorClass` prop (thin gradient bar under the
  value, `bg-input-bg` track) — this is a **TL-only** mockup pattern (verified
  absent from all Employee mockups and TL/standby.html via grep on the
  mockup source). Applied at 5 cascading call sites, all driven by real
  ratios already present in the data (no fabricated metrics): `TLStatsCards`
  (dashboard), `OvertimeSummaryCards`, `LeaveStatsCards` (both gated by the
  existing `canApprove` permission flag), `TicketKPITeamStats`
  (team-performance/upload-management shared stats), `TicketKPITeamPage`
  (SLA Compliance bar uses the real SLA %). `KPICard` threads the same two
  props through to `StatCard`. Fixed `TicketKPITeamBatchesTable`'s blank
  `""` Actions column header to `"Actions"` (matches the established
  convention used everywhere else; the Eye/Trash actions themselves were
  already implemented — the earlier read of "missing Actions column" from
  the audit was a labeling gap, not a functional one).
- New/updated tests pin the exact mockup-matching percentages (e.g. Leave
  pending 2/(2+6)=25%, approved 75%, vacation balance 16/22≈73%, used
  5/22≈23% — these are literal ratios encoded in the mockup's own static
  HTML, not approximations).
- Verification: full frontend suite 1893/1893 (298 files); tsc clean; ESLint
  clean; Prettier clean; production build clean; fallow dead-code 6
  pre-existing issues, 0 new. Mobile: no horizontal overflow at 375/768/1280
  on dashboard, overtime, leave, team-performance, upload-management (the
  pages touched this session).
- Independent review (same day) — corrections to the record above:
  (1) `mobile375-tl-team-performance.png`/`mobile375-tl-upload-management.png`
  were byte-identical mislabeled copies of a mobile LEAVE capture, so the
  mobile claim was unsupported for those 2 pages; re-verified live (375px
  dark: scrollWidth==innerWidth, correct render). (2) Light-mode layout
  parity verified on dashboard/team-performance/upload-management at 1280
  (DoD gap closed; zero color changes). (3) The plan's raw-color audit said
  3 organigrama hits; actual repo-wide total is 7 (CustomChartViewer 84/91/93,
  BuilderNode 66/94/101/165) — still open keep-or-tokenize decision; dark
  variants render on-theme. (4) Ticket KPI stat cards hardcode
  `progressPercent={100}` (mockup uses ratio widths, 0% at zero; Avg
  Resolution bar amber vs mockup blue-500) — P3 open decision. (5) Phase 6
  ui-ux subagent review was not run — still open. (6) TL mockup captures
  missing for organigrama/skills-history; PWA install banner pollutes some
  captures. Corrected plan + deferred-decision list:
  `.devin/plans/plan-employee-tl-fidelity-2026-09-03.md`.
- Backend dev server (`:8000`) had stopped mid-session (unrelated to this
  change — pure frontend edits); restarted via
  `venv\Scripts\python.exe manage.py runserver 8000` in the background to
  complete live visual verification.
- **Deferred, needs user decision (not implemented — out of pure-visual
  scope, flagged rather than built unilaterally):**
  1. TL Dashboard mockup shows a different information architecture (squad
     bar chart + Request Pipeline + generic activity table) vs the live
     `TeamLeaderDashboard` (Queue Mix donut + Monthly Comparison + Top
     Bottlenecks, richer/real ticket-KPI-driven data). Recommendation: keep
     current IA (already visually aligned via the progress-bar fix above);
     only rebuild if the user specifically wants the mockup's exact layout.
  2. TL Settings mockup has a "Client Assignment" table (TL assigns team
     members to clients). Live has a different, self-service "My Clients"
     multi-select. This is a real feature gap requiring new UI + likely
     backend wiring, not a restyle — deferred pending a separate feature
     request.
  3. Employee "My Skills" mockup uses a static read-only card grid; live
     uses an editable-row pattern (richer UX). Recommendation: keep live's
     editable pattern as-is (converting to static cards would regress
     functionality) — no action taken.
  4. TL sidebar nav shows an amber pending-count badge on "Pending
     Approvals" in the mockup; live has no nav-badge mechanism. Implementing
     correctly requires a new lightweight globally-mounted data hook (the
     existing dashboard hook is too heavy — 4 uncached queries with
     `staleTime: 0` — to mount in the always-visible `Sidebar`). Deferred as
     a small new-feature addition rather than a pure CSS/layout fix.
     (NOTE: since implemented — see F1 in
     `plan-theme-primitives-fidelity-2026-09-04.md` Appendix G.)

## Current session outcome — 2026-09-04 (fidelity walk completion: C26 + C50 + final verification)

- Completed the last two open items of
  `.devin/plans/plan-theme-primitives-fidelity-2026-09-04.md` (one-at-a-time
  screenshot rule observed; both captures hash-verified unique, not duplicate
  mislabels). Zero code changes — both were NO-gap closes.
- C26 tl-Settings: Profile/Appearance/My Clients/NotificationPreferences/
  Change Password/Logout cards all shared patterns + semantic tokens. Mockup
  deltas are recorded spec-wins (read-only profile + validated password form
  superset; plugin-gated notification section; Client Assignment member table
  stays DEFERRED per the 2026-09-03 decision #2 — real feature gap). Batch 3
  (TL 16/16) COMPLETE.
- C50 admin-Settings: the file captures the PAYROLL settings route, so the
  counterpart is `admin-payroll-settings.html` — field-for-field parity (all
  11 fields, values, helpers); solid-primary Save Changes keeps the recorded
  gradient-CTA rejection (AA). `GlobalSettingsPage.tsx` code-verified against
  `admin-global-settings.html` (same 3 fields). Batch 4 (admin 24/24)
  COMPLETE — full 50/50 walk COMPLETE.
- Phase 5 final verification (ONCE): full frontend suite 1925/1925
  (306 files); tsc clean; ESLint 0 errors (2 pre-existing TanStack Virtual
  warnings); Prettier 35 pre-existing warnings (below the 40 documented, none
  new — no src files touched this session); production build clean (6.46s);
  fallow dead-code = documented items only (CardFooter + dompurify/
  tailwind-merge false positives); fallow dupes 8.6% (pre-existing families,
  test-file drift only); `manage.py check` clean, `makemigrations --check`
  "No changes detected".
- Plan file updated with C26/C50 outcomes; no durable invariant changes (no
  code changed, nothing to rotate into context files).

## Current session outcome — 2026-09-04 (Ticket KPI Avg Resolution bar hue)

- Closed the last open P3 from the 2026-09-03 employee/TL review (user-approved
  from the decision queue): `TicketKPITeamPage.tsx:133` Avg Resolution bar
  `bg-amber-500` → `bg-blue-500`. Verified against BOTH mockups
  (`TL/team-performance.html:84`, `TL/ticket-kpi.html:75` — both blue; the
  three sibling bars already matched: indigo/purple/emerald). Width logic
  (`x > 0 ? 100 : 0`, real SLA %) already honored the mockup's 0%-at-zero
  contract, so this was purely the hue. `TicketKPITeamStats` checked — no
  amber bar there; scope was exactly one line.
- TDD: `TicketKPITeamPage.test.tsx` KPICard mock now forwards
  title/color/percent as data attrs (existing 7 tests unaffected) + new case
  pinning the blue bar — red (1 failed) → green.
- Verification: ticket_kpi scope 60/60 (14 files); tsc, ESLint (touched),
  Prettier (touched), production build clean. Findings #3 and deferred #6 in
  `.devin/plans/plan-employee-tl-fidelity-2026-09-03.md` marked resolved.

## Current session outcome — 2026-09-04 (TL Client Assignment feature)

- Implemented the deferred TL Settings "Client Assignment" table as a real
  feature per `.devin/plans/plan-tl-client-assignment-2026-09-04.md`
  (user-approved scope: TL own-team + admin, Settings card, single dropdown
  + Save, self-service kept last-write-wins).
- Backend (`apps/users/viewsets.py`): new `POST
  /api/users/users/<pk>/assign_member_clients/` detail action — direct
  target fetch (never `get_object()`, TL queryset is self-only), explicit
  order staff → `is_hr_only` 403 → `is_team_leader` + `get_team_member_ids`
  403, then active-only + max-one validation (mirrors self `assign_clients`
  shape). No model/migration. TDD: 12-case matrix red (11 fail, no route) →
  green, including TL+HR multi-role allow and pure-HR deny.
- Frontend: `userService.assignMemberClients`, NEW `useClientAssignment`
  hook (reuses `["team","members"]` + `["overtime","available-clients"]`;
  0/1/N → None/single/Multiple drafts; dirty-rows-only save; invalidates
  team roster + overtime form scope), NEW `ClientAssignmentSection` card
  (mockup title/helper/table verbatim, Radix Selects, solid Save per CTA
  rule, shared EmptyState), gated `{isTeamLeader && !isCRScoped}` in
  `SettingsPage`. TDD: 10 new tests red (missing modules) → green.
- Verification: backend `apps.users` suite OK, Ruff clean; frontend settings
  29/29; FULL suite 1939/1939 (308 files, +14/+2); tsc, ESLint, Prettier
  (touched), build clean;   `manage.py check` + `makemigrations --check`
  clean; fallow dead-code back to documented baseline (caught + removed one
  new unused `ClientDraft` export); dupes 8.5% no new families.

## Current session outcome — 2026-09-05 (live verification: Client Assignment card)

- Live-verified the new Client Assignment feature against the running dev
  servers (both already up with current code — new route probed 401, not
  404, so no restart needed). Auth via the proven scrape-script mechanism
  (Django-shell token pre-gen for `enri.demnushi` + refresh-endpoint
  interception; zero throttled-login hits). Temp capture script + shots
  removed after review (fallow hygiene).
- 3 captures, all overflowPx=0: desktop dark + light (1280), mobile dark
  (375). Card renders with the 6 in-scope members and real current values
  (SIAE/MSC/None), solid Save Changes, self-service My Clients untouched
  above; light mirrors dark; mobile stacks cleanly. No dev-data writes
  performed (backend 12-case matrix already covers the write path; hook
  tests cover the wiring).
- Bonus: F1 pending badge ("1") confirmed visible live on Pending Approvals
  in both desktop shots.

## Current session outcome — 2026-09-05 (theme megaplan hardening, no code)

- Reviewed `~/.devin/plans/plan-162c9ccec579f9dc.md` (frontend theme
  refactoring megaplan) against live code per the senior plan protocol
  (`11-PLAN-CREATION.md`): all 10 mandatory sections present, route tables
  match `AppRoutes.tsx` (168 lines) exactly, nav-contrast strings match
  `SidebarNavLink.tsx`/`SidebarNavGroup.tsx` verbatim, `/skills/me` staleness
  confirmed (9 hits across 3 scripts), all 5 seeded role identities verified
  in `seed_e2e_data.py:24-66`. Verdict: fully detailed, no rewrite needed.
- Hardened 6 automation blockers so the plan is implementation-ready with
  zero open decisions: (1) reference map now cites all 4 capture dirs
  (desktop/mobile × light = 67 each, desktop-dark = 50) + legacy
  storage-state caveat (admin/employee/tl only — Phase 2 must use Django-shell
  JWT pre-gen); (2) current `manifest.json` documented as hash/heading-less
  (Phase 2 extends it); (3) `--smoke=true` verified MISSING (would have taken
  the wipe-and-full-run path) — exact flag spec + acceptance added, Appendix A
  command corrected; (4) Playwright command pinned to
  `--project=chromium --project=mobile-chromium`; (5) Fallow baseline
  re-verified live: dead-code 22 issues/7 suppressed (10 files, 7 exports,
  1 type, 2 duplicate pairs — old "10 issues" estimate was stale), dupes
  323 groups / 8,622 lines (8.5%) / 191 files, with pre-classification of the
  organigrama + mockup-token items; (6) seed/ROLES line citations added.
- No application source touched; no tests run (plan-only session).

## Current session outcome — 2026-09-06 (theme megaplan review: admin evidence + tooling fixes)

- Independent review of the implemented theme megaplan
  (`~/.devin/plans/plan-162c9ccec579f9dc.md`): all Phase 5 class changes
  verified in source (5 nav sites, subtitles, chips/pills/drawers; icons
  kept), Phase 2 tooling + 12 node tests green, new Phase 5 test files
  pass, tsc/ESLint/Prettier clean, `--smoke` per spec, remaining
  `bg-primary/10 text-primary` hits are icon containers/documented defers.
  Scope-reconciliation addendum added to the plan Phase 5 log:
  text-success/warning/info never probed but benign by token math
  (6.7:1/7.9:1/unused-as-text); pre-existing small `text-destructive` on
  dark ≈3.6:1 flagged out-of-scope (token pinned).
- Admin screenshot regeneration + mockup comparison (dashboard, clients,
  leave-balances, global-settings, payroll-runs, leave-requests): visual
  system matches the Admin mockups (gradient tile, ENTERPRISE subtitle,
  section labels, text-foreground active nav, PageShell border, table/form
  anatomy, light inversion clean).
- THREE tooling bugs found and fixed in `scrape-screenshots.mjs` +
  `visual-capture-helpers.mjs` (TDD where applicable, node tests 12/12):
  (1) sonner error toasts survive SPA navigation and photoboomed the
  captures AFTER a failing route (leave-requests/standby-logs showed
  "Failed to load data" while their own rows recorded no errors) → new
  `dismissToasts()` before every screenshot; (2) validity ignored failed
  requests → `/admin/standby-logs` was valid despite 2× 403 (superuser-only
  `admin_logs`, standby viewsets.py:504 — same fixture-block as
  overtime-logs, missed because its h1 renders through the error state);
  valid rows now require 0 failed requests + 0 console errors, invalid rows
  keep tracking their file (no orphans); (3) filtered-run merge pre-deleted
  ALL rows for the filtered role before capturing, so a throttle-429 role
  skip or narrow `--paths` run silently dropped valid evidence (observed
  520→316 rows) → merge now supersedes only re-captured
  role|theme|viewport|path keys and reports the kept count.
- Re-run evidence (throttle cleared via runserver restart): 520 rows
  restored; admin 188 valid / 16 invalid — invalid classes exactly
  /calendar (prompt-state), /admin/overtime-logs + /admin/standby-logs
  (fixture-blocked), /admin/data-import (env-blocked); 0 valid rows with
  errors; leave-requests clean in all 4 states (toast gone, Export CSV
  visible). Plan Phase 7 review addendum records the full detail.
- Ops: user-scope 1000/hr throttle exhausts across repeated capture runs →
  /api/users/users/me/ 429s → SPA logs out → "redirected to /login —
  skipping role"; restart runserver between full-matrix runs.
- Mobile verified solid: 260 mobile rows, 0 overflow, 228 valid — every
  mobile invalid is the same permission-blocked class as desktop. Full
  matrix after gate hardening: employee/tl/tl_hr 100% valid; admin 188/204
  (4 documented triaged classes); hr 82/128 (46 invalid = permission-blocked
  admin-shell routes only — hr lacks superuser/plugin data access; core hr
  routes all clean). Two more gate bugs fixed during hr re-runs:
  (1) dismissToasts DOM removal crashed sonner/React (`removeChild` error
  broke the root → 116/128 hr rows blank) → replaced with idempotent
  injected stylesheet hiding `[data-sonner-toast]`/`[data-sonner-toaster]`;
  (2) React Query navigation aborts (ERR_ABORTED, no HTTP status) from the
  PREVIOUS route polluted the NEXT route's bucket → requestfailed handler
  now records failure().errorText and skips ERR_ABORTED/ERR_INTERRUPTED;
  (3) manifest `/team` gained `expectedDenial: ["employee","hr"]` — the
  Access Denied variant's own 403s are the documented denial mechanism, not
  defects. Details in plan Phase 7 review addendum 2.
- Root cleanup (user-approved 2026-09-06, ~37 MB removed): deleted
  backend-review.log, scrape.log, logs/django.log, .coverage, .pytest_cache,
  .ruff_cache, root __pycache__, staticfiles/ (regenerable), the 3 generated
  skillplugin_*.md (generator .py KEPT per user), export_organigrama .pyc,
  design-audit contrast-check*.cjs + header-*.png temp artifacts, and 13
  old design-audit evidence dirs from completed prior plans (baseline,
  calendar-refactor, catalog-*, design-review, employee-tl-fidelity,
  fidelity-walk, heatmap-references, mockup-captures, skills-live-extract,
  skills-responsive-captures, test-extract2, theme-refactor). KEPT:
  opencode.json (functional opencode config wiring .devin rules), the NS
  Skill Matrix xlsx (user source material), export_skills_plugin.py,
  current-plan evidence (app-extract, app-extract-pages, prerendered,
  phase0-evidence), design-screenshots, mockups. Post-cleanup: `manage.py
  check` clean. NOTE: AGENTS.md references to deleted design-audit
  subdirs (e.g. theme-refactor/fidelity-live) are historical record only —
  the artifacts no longer exist on disk.
- Dark-only regeneration (user request 2026-09-07): `scrape-screenshots.mjs
  --theme=dark` re-captured all 5 roles dark desktop+mobile (merge mode
  kept light rows); invalid dark rows are exactly the documented triaged
  classes. Also removed 86 orphan screenshots from the old pre-manifest
  naming convention (untracked by manifest, e.g. `admin-Users.jpg`) —
  design-screenshots is now 498 files ↔ 498 manifest rows, perfect 1:1,
  0 missing, 0 overflow on dark.
- Design-suggestions audit (user 2026-09-07, claim-by-claim vs code): most
  claims ALREADY IMPLEMENTED — Obsidian-Slate tokens + Input primitive
  (`bg-input-bg border-input focus-visible:ring-focus`), StatCard
  `progressPercent`/`progressColorClass` opt-in props with real ratios
  (HRDashboardStats), StatusBadge role="status"+aria-label, DataTable
  renders shared EmptyState (21 importers), GlassCard isHoverLift (123
  consumers), KPICard wraps ui/StatCard (inherits mono/tabular), ticket↔
  overtime linking EXISTS (TicketOvertimeLink model + AutoMatchReview
  TL/Admin confirm/reject in TicketKPITeamPage), useValidWorkspaceIds
  enforced for calendar (HR Reports uses non-persisted local single-select
  — stale-ID risk n/a), overtime query keys include userId+rangeKey.
  FALSE PREMISE: StandbyPattern has NO multi-slot backend schema (single
  start/end + one day_of_week, apps/standby/models/core.py:29) — "Phase 2
  multi-slot UI matching updated backend schema" would need a backend
  migration first. PARTIAL: table→card mobile transitions exist only on
  ResourceAccess pages; other tables horizontal-scroll (0 overflow at
  320px verified). FIX APPLIED (TDD): calendar/StatCard value+percent now
  `font-mono tabular-nums` (new StatCard.test.tsx 2/2 red→green; only
  consumer UserStatusModal has no pinned tests).
- Four-tweak review (user 2026-09-07, claim-by-claim, all TDD red→green):
  (1) MySkillsPage level select truncated "L2 - Developing" at fixed
  w-[140px] (Radix line-clamp-1) → `w-auto min-w-[145px]`; sweep found other
  fixed-width selects are filters (ellipsis standard) — no same bug.
  (2) MySkills row showed the level 4× (badge + dots + "Current L{n}" column
  + select) → Current column REMOVED, grid 3→2 cols; no other page has the
  pattern. (3) OrgNode person cards were flat on the dark canvas →
  `shadow-md shadow-primary/10 hover:shadow-lg hover:shadow-primary/20`
  (semantic tokens — REJECTED the suggested raw `bg-[#131926]`/
  `purple-500/40` hex per token rules); tech nodes stay shadow-sm. (4)
  TLStatsCards already had distinct glows/icon colors/progress colors but
  bare icons → new opt-in `iconWellClass` prop on ui/StatCard (backward
  compatible, bare icon when omitted) + per-type wells using existing
  `accent-red/orange/yellow/violet/emerald` tokens (NOT the suggested raw
  500-level tints). Tests: StatCard +2, TLStatsCards +1, MySkillsPage +2,
  OrgNode +2 (31/31 batch red→green); affected dirs 640/640; tsc clean
  (fixed 2 missing vitest imports + 1 null-narrowing in the new calendar
  tests); ESLint/Prettier clean.
- Targeted modal capture (user 2026-09-07, "only changed templates"): the
  calendar StatCard renders ONLY inside UserStatusModal (calendar → Schedule
  List → user click), unreachable by route captures — interactive Playwright
  capture added (temp script removed after use). Auth note: storage-state
  refresh cookies rotate on use → stale after one run; regenerate via
  `scripts/_gen-storage-state-all.mjs` or generate fresh Django-shell tokens
  per run (scrape's createAuthContext pattern: refresh-endpoint interception
  + localStorage user/theme bootstrap). e2e_employee_a/e2e_tl have NO seeded
  calendar events (empty Schedule List) → modal capture used enri.demnushi
  (only account with events). Captures:
  `design-screenshots/interactive/calendar-user-status-modal-dark-{desktop,mobile}.jpg`.
  BONUS FIX (TDD): the interactive capture exposed a real mobile bug —
  UserStatusModal stat grid was fixed `grid-cols-3` inside the
  overflow-hidden dialog, clipping cards at 375px → now
  `grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6` (two-card row →
  `grid-cols-1 sm:grid-cols-2`); new UserStatusModal.test.tsx 2/2 red→green;
  calendar dir 92/92 green; re-capture verified stacked layout + JetBrains
  Mono numerals, 0 console errors.

  `grid-cols-1 sm:grid-cols-2`); new UserStatusModal.test.tsx 2/2 red→green;
  calendar dir 92/92 green; re-capture verified stacked layout + JetBrains
  Mono numerals, 0 console errors.

## Current session outcome — 2026-09-07 (visual-fingerprint tool + audit fixes)

- Built dev-only Playwright fingerprint verifier (`frontend/scripts/
  visual-fingerprint.mjs` + `.test.mjs` 32/32 node tests + `visual-verify.mjs`
  CLI: capture/verify/diff/check/compare). Captures a11y+styles+bounds per
  landmark region as diffable JSON; diff engine reports regressions
  (missing/added, visibility, bounds, style) + invariants; inconsistency
  detector flags unnamed interactive elements, font-size drift, overflow.
  Reuses visual-route-manifest roles/viewports + scrape auth pattern; ONE
  browser context per role×theme with SPA navigation (per-role fresh JWT
  tokens) — 492/520 fingerprints captured whole-app (28 expected skips).
  Output `design-fingerprints/` (gitignored).
- Full-app audit from the 492 fingerprints (23,476 components) — findings
  fixed TDD red→green:
  1. WCAG AA regression: dark `--primary-foreground: 220 20% 6%` on violet
     `--primary: 262 83% 58%` measured 3.41:1 (needs 4.5) → `210 40% 98%`
     (5.67:1). tokens.test.ts pins --primary only, so safe; new regression
     guard test added (6/6).
  2. `ApprovalActionsColumn` approve/reject icon buttons had NO accessible
     name (shared by leave/overtime/standby approval tables) → aria-labels;
     new test 2/2.
  3. `NotificationBell` bell trigger unnamed on EVERY page (488 hits) →
     aria-label="Notifications"; test 8/8.
  4. `TeamsTableRow` select checkbox unnamed → `Select team {name}`; test 2/2.
  5. Label-association gaps: SettingsPage password fields, GlobalSettingsPage
     3 inputs, shared `FormInputField` (useId + htmlFor) — 3 test files
     red→green (16/16, 1/1, 5/5).
  6. LeaveRequestsTable delete button title-only → +aria-label; new test
     (ResizeObserver stub needed for DataTable).
  7. Contract gap: `/admin/{overtime,standby}-logs` pages reachable by staff
     admin/HR but `admin_logs` endpoints required superuser (e2e_admin 403s
     in fingerprints) → endpoints now allow staff OR HR (read-only GET,
     matches SuperuserRoute guard); 6 new backend tests red→green.
  8. Contract gap: HR admin dashboard fired audit_log summary query that
     403s (fail-secure PluginPermission) → query `enabled: canView("audit_log")`
     + RecentActivityWidget gated (testid added); 2/2 red→green.
  9. Contract gap: organigrama admin directory/builder/publish pages render
     for HR (route guard) but charts API is staff-only (IsStaffOrSuperuser)
     → all 3 pages redirect non-staff to /organigrama; PermissionContext
     mock added to 3 test files; 15/15 green.
- Tool false positives fixed from audit learnings: zero-dimension/not-visible/
  text-overflow skip `display:none` responsive duplicates; text-overflow now
  measures real overflow (scrollWidth > clientWidth), not default `clip`;
  accessibleName checks `label[for]` for ANY element with id (Radix
  checkbox/button pattern); composite IDs include heading level
  (`heading:h1`) to stop page-title/table-header collisions.
- Verification: frontend full suite 1993/1993 (320 files, +84); tsc, ESLint
  (changed dirs), Prettier (touched files) clean. Backend: standby+overtime
  102/102; manage.py check, ruff (both apps), makemigrations --check clean.
  Audit artifacts in `design-fingerprints/` (audit-analysis.json,
  audit-drift.json, inconsistency-report.txt — gitignored).

## Current session outcome — 2026-09-07 (admin GUI screenshot-review fixes)

- Second screenshot-review batch (admin pages) verified claim-by-claim; 5
  real fixes implemented TDD red→green, 3 claims STALE (based on deleted
  pre-manifest screenshots):
  1. OrganigramaPublishPage: audience summary "Who gets access?" rendered in
     BOTH cards (dangling under the left Save button) → removed from
     OrganigramaPublishAudienceCard (isPublic prop dropped), right StatusCard
     callout kept. Chart name was a bare subtitle string ("test") → now a
     "Target chart:" label + mono pill (`bg-primary/10 text-foreground`,
     contrast-consistent with Phase 5).
  2. PayrollWagesPage: "Missing wage" used the rose/destructive variant for
     all 8 rows (alarm fatigue) → `variant="pending"` (amber) — rose reserved
     for errors; test contract updated per the approved visual change
     (PayrollWagesPage.test rose→amber).
  3. TicketKPITeamPage + TicketKPITeamManagementPage: bare
     "You do not have team leader permissions." EmptyState for admins →
     added description (module reserved for TLs; aggregates in HR Reports) +
     conditional "Go to HR Reports" action (isAdmin||isHR only — plain
     employees get no dead-end CTA since /hr/reports redirects them).
     Tests mock PermissionContext (usePermissionMock pattern).
  4. DashboardPage: admins hit the "Select Dashboard" interstitial because
     there was NO render branch for the "admin" dashboard type →
     `<Navigate to="/admin" replace />` when selectedDashboard==="admin" &&
     isAdmin; DashboardPage.test restructured with a MemoryRouter+Routes
     wrapper (Navigate needs router context) + /admin probe route.
  STALE claims (already fixed by earlier work): reports/HR-reports date
  inputs already use the shared DatePicker (calendar icon + Input + popover —
  verified in the CURRENT admin-admin-reports.jpg capture); admin My Skills
  select truncation = same component as the TL fix (previous session).
- Verification: affected dirs 364/364 (organigrama, payroll, ticket_kpi,
  dashboard, team); tsc clean; ESLint 0 errors; Prettier clean.

## Current session outcome — 2026-09-05/06 (theme megaplan implemented, Phases 0–9)

- Implemented `~/.devin/plans/plan-162c9ccec579f9dc.md` end-to-end (per-phase log in plan Implementation Log; no commit/push).
- Phase 0: evidence dispositions — 23 cross-label duplicate-hash groups INVALID (wrong-page saves, unswitched role identities), manifest 17 stale desktop-dark refs, 14 suspect admin-* extract labels; `design-audit/phase0-evidence/hash-report.json`.
- Phase 1: canonical matrix verified — 50 static + 4 dynamic routes, 9 plugin metadata files, all owners exist.
- Phase 2: NEW `visual-route-manifest.mjs` (50 routes + login/redirects/guard-only) + `visual-capture-helpers.mjs` (heading/theme/sha/overflow/console gates) + 12 node tests; 3 capture scripts centralized (`/skills/me` gone, deterministic e2e fixtures, `--smoke`, heading/path/theme gates, extended manifest rows); `_gen-storage-state-all.mjs` now emits all 5 states.
- Phase 3: 5/5 role smokes + employee 48/48 valid (0 console/net/overflow anomalies); found+fixed 3 tooling bugs (calendar month-h1, analytics unregistered-route, login-gate false positive).
- Phase 4: audit-only classification (44 raw-palette hits = 36 translate false positives + 8 accepted; 131 text-primary triaged; !important/inline/interpolation clean; sticky/z-index accepted).
- Phase 5: browser contrast probe (fixed 2 probe compositing bugs) confirmed dark active-nav 3.2:1 FAIL → fixed 21 files to `text-foreground` (nav ×5, subtitles, 14 text sites; icons kept) under 26 red→green tests; deferred filled-button system (3.41 dark, product-wide) + hidden-state patterns with written reasons. Affected 247/247 green.
- Phase 6: no structural consolidation (documented); `.fallowrc.json` tooling-unit suppression; dead-code back to exact baseline.
- Phase 7: full matrices (tl/tl_hr 100% clean; hr/admin with 3 triaged classes each: calendar PROMPT-STATE, overtime-logs superuser-403 FIXTURE-BLOCKED, data-import ENV-BLOCKED); dynamic fixtures resolved read-only (group 68, run 4, chart 2); guard spec 4/4; auth corrections (`/team` denial-in-place, per-user plugin sets, isAdmin gates). Superuser promotion for e2e_admin was offered and declined by abort — error states stand, no seed change.
- Phase 8: 320px stress 18/18 zero-overflow; manifest 375px overflow zero; a11y intact.
- Phase 9: full suite 314/1965 PASS; tsc/ESLint(0 err)/build clean; Prettier 33 pre-existing (none touched); `check` + `makemigrations --check` clean; fallow dead-code 22/7 baseline-exact, dupes 8,579 (8.4%, net −43 lines).
- Ops: user 1000/hr throttle trips mid-long-run (429s) → restart-runserver remedy + `--paths` filter added; orphan-PID checks before each restart.
