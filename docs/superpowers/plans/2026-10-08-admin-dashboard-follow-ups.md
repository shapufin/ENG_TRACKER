# Admin Dashboard Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the five worthwhile items from the "Further ideas" list of the admin-GUI adoption plan: filtered deep links from insights, a better command palette (recents, user search, also in the main app), dashboard presets, a dashboard PDF export, and a real trend-period selector.

**Architecture:** All frontend work reuses what merged in PRs #49–#57 (`deriveAdminInsights`, `AdminCommandPalette`, `DashboardContext`, `WidgetFrame`/`ChartCard`, `captureChartsToPdf`). One backend change (`?months=` on `admin_trends`). Six tasks, each its own PR off fresh `origin/main`.

**Tech Stack:** Django/DRF (`apps/dashboard`), React 19 + react-router 7 + TanStack Query, Radix `Dialog`, recharts, `jspdf` + `html2canvas-pro` (already installed), vitest/RTL, Django `TestCase`, Playwright.

**Spec:** "Further ideas" in `docs/superpowers/plans/2026-10-08-admin-gui-mockup-adoption.md` plus the 2026-10-08 chat request "start further ideas, make plan". Context: `.devin/context/03-FRONTEND-PATTERNS.md` (§10, §13), `DESIGN.md`, `docs/table-header-contract.md`, `AGENTS.md` (2026-10-08 admin dashboard entries).

## Global Constraints

- Obsidian Enterprise tokens only: no raw hex, no `slate-/zinc-/gray-`, status colour via `tone.ts`; every new `motion.*` reduced-motion-safe; dialogs use the `size` prop and one `DialogBody` (`node scripts/modal-audit.mjs` exit 0); hand-rolled tables use `tableStyles.ts` (`node scripts/table-header-audit.mjs` exit 0).
- No new npm/pip dependency. Run Django with `py -3.14`; quiet flags; targeted tests while iterating, full suite once at the end. CI also runs `npx fallow dead-code` (no unused file/export/dependency) and `npx tsc -b --noEmit`.
- New admin endpoints/params stay staff-only (`IsAdminUser`); never expose data a non-staff viewer could not already see. CR-only admins keep their restricted palette/nav (use `useAdminNavItems` output, never a hard-coded list).
- Core code must not statically import plugin modules; heavy libs (`jspdf`, `html2canvas-pro`) only via dynamic `import()` inside the click handler.
- `localStorage` access always in `try/catch` with an in-memory fallback, keyed per user id.
- Query keys include every result-changing parameter; admin mutations call `invalidateAdminDashboard(qc)`.
- Never commit or push unless asked; the user pre-authorised the PR → CI → squash-merge loop for this work (memory `feedback_autonomous_review_merge`). Table cells stay inside `TABLE_*` constants.

## Review Focus

1. **Hostile or odd URL input:** `?status=bogus`, `?q=%3Cscript%3E`, `?months=0|25|abc|3.5|-1` must degrade (all/ignored/400), never crash, never reach the DB unvalidated (Tasks 1, 2, 6).
2. **Search race and scope:** the palette's user search must ignore a slow response that arrives after a newer query, fire nothing under 2 characters, and show only what `getProfiles` already scopes for that viewer (Task 2).
3. **Presets must not widen access:** applying a preset may never switch on a superuser-only or plugin-gated widget the viewer cannot see, and unknown ids in a preset are dropped (Task 4).
4. **Export correctness:** PDF export with nothing capturable, while data is still loading, or on failure must not produce an empty/blank PDF or leave the button stuck (Task 5).
5. **Stale layered state:** changing the trend period must refetch (key includes `months`), survive reload (URL), and a layout save from a preset must not race a toggle (Task 4 uses the queued `commit`) (Tasks 4, 6).

## Not building (decided)

- **Server-side TTL cache for `admin_trends`/`admin_people`:** no evidence of a hot path; production is PostgreSQL and the endpoints are constant-query. Revisit with `explain(analyze=True)` numbers.
- **Weekly insights digest:** needs a scheduler this repo does not have; would be another lazy-purge hack.

## File Structure

- `frontend/src/hooks/useUrlParamState.ts` (+ test) — validated URL-backed state.
- `frontend/src/components/layout/CommandPalette.tsx` (+ test) — generic palette extracted from `AdminCommandPalette`; `AdminCommandPalette.tsx` becomes a thin wrapper; `components/layout/paletteRecents.ts` (+ test).
- `frontend/src/config/dashboardPresets.ts` (+ test); `frontend/src/pages/admin/components/DashboardPresetMenu.tsx` (+ test).
- `frontend/src/pages/admin/components/ExportDashboardPdfButton.tsx` (+ test).
- `apps/dashboard/admin_trends.py`, `apps/dashboard/viewsets.py`, `apps/dashboard/tests/test_admin_trends.py` (months param).
- Modify: `lib/adminInsights.ts`, `pages/admin/hooks/{useLeaveRequestFilters,hoursLogsFilter}.ts`, `components/ui/DataTable.tsx`, `pages/admin/hooks/useUsersPage.ts`/`components/UsersPageTable.tsx`, `components/layout/{AdminShell,AppShell}.tsx`, `context/DashboardContext.tsx`, `components/dashboard/ChartCard.tsx`, `dashboard-widgets/*`, `AdminDashboardPage.tsx`, `hooks/useAdminDashboardQueries.ts`, `services/dashboardService.ts`, `types/index.ts`, `e2e/admin-dashboard.spec.ts`.

---

## Task 1: Insight deep links with filters

**Files:**
- Create: `frontend/src/hooks/useUrlParamState.ts`, `frontend/src/hooks/useUrlParamState.test.tsx`
- Modify: `frontend/src/pages/admin/hooks/useLeaveRequestFilters.ts`, `frontend/src/pages/admin/hooks/hoursLogsFilter.ts` (`useHoursLogsFilterState`), `frontend/src/lib/adminInsights.ts`, `frontend/src/lib/adminInsights.test.ts`
- Test: extend `pages/admin/hooks` tests for the two hooks (create `useLeaveRequestFilters.test.tsx`, `hoursLogsFilter.test.tsx` if absent)

**Interfaces:**
- Produces:
  ```ts
  /** URL-backed state: reads ?key, accepts only values in `allowed`, else `fallback`; writing the fallback removes the param. replace:true history. */
  export function useUrlParamState<T extends string>(
    key: string, allowed: readonly T[], fallback: T
  ): [T, (next: T) => void];
  ```
- Consumes: `useSearchParams` (react-router).

- [ ] **Step 1: Failing tests** `useUrlParamState.test.tsx` (MemoryRouter + a probe): `reads a valid value`, `bogus value falls back`, `missing falls back`, `setting a value writes ?key= and keeps other params`, `setting the fallback deletes the param`, `uses replace (history length unchanged)`.
- [ ] **Step 2: Run** `cd frontend; npx vitest run src/hooks/useUrlParamState.test.tsx` → FAIL (module missing).
- [ ] **Step 3: Implement `useUrlParamState`** with `useSearchParams`; `allowed.includes(raw as T)` guard.
- [ ] **Step 4: Failing tests for the two filter hooks:** rendering inside `MemoryRouter initialEntries={["/admin/leave-requests?status=pending"]}` yields `filterStatus === "pending"`; `?status=bogus` yields `"all"`; `setFilterStatus("approved")` updates the URL. Same for `useHoursLogsFilterState` (`HoursLogStatus` values `all|pending|approved|rejected`).
- [ ] **Step 5: Implement:** replace the `useState` for `filterStatus` in both hooks with `useUrlParamState("status", [...], "all")`. Every other filter stays `useState`. Existing callers of these hooks need no change (same return shape); the pages already render inside a router.
- [ ] **Step 6: Point the insights at them:** in `deriveAdminInsights` the `AGING_ROUTES` become `/admin/overtime-logs?status=pending`, `/admin/standby-logs?status=pending`, `/admin/leave-requests?status=pending`; `period-open` stays `/admin/overtime-logs`. Update the two `adminInsights.test.ts` assertions that pin those paths.
- [ ] **Step 7: Run** `npx vitest run src/hooks src/lib src/pages/admin` → PASS; `npx tsc --noEmit`; `npx eslint src --quiet`.
- [ ] **Step 8: Commit** `feat(admin): insights open the target page with the pending filter applied`.

## Task 2: Palette v2 — recents and user search

**Files:**
- Create: `frontend/src/components/layout/paletteRecents.ts` (+ `.test.ts`)
- Modify: `frontend/src/components/layout/AdminCommandPalette.tsx` (+ extend its test), `frontend/src/components/ui/DataTable.tsx` (new optional prop `initialSearch?: string`), `frontend/src/pages/admin/components/UsersPageTable.tsx` + `pages/admin/UsersPage.tsx` (read `?q=` and pass it down), `frontend/src/components/ui/DataTable.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function readRecents(userId: number | undefined): string[];            // paths, newest first, max 5
  export function pushRecent(userId: number | undefined, path: string): string[];
  // AdminCommandPalette gains optional prop: userId?: number  (recents key; omit => no recents)
  // DataTable: initialSearch seeds the internal globalFilter once on mount
  ```
- Consumes: `userService.getProfiles({ search, page_size: 5 })` (`services/userService.ts`) — server scopes results to what the viewer may list; `AdminNavItem`.

Decisions: user search starts at **2 characters**, debounced **250 ms**, stale responses ignored (compare a request counter), at most 5 results shown under a "Users" heading; choosing one navigates to `/admin/users?q=<username>`; recents show only when the query is empty and only paths still present in `items` (role/plugin changes cannot resurrect a dead link); selecting any page pushes a recent.

- [ ] **Step 1: Failing tests `paletteRecents.test.ts`:** `pushRecent dedupes and moves to front`, `caps at 5`, `per-user keys do not mix`, `throwing localStorage returns [] and does not throw`, `no userId → [] and never writes`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** with key `admin.palette.recents.<userId>`, all access in `try/catch`.
- [ ] **Step 4: Failing palette tests** (mock `userService.getProfiles`, fake timers): `empty query lists recents first under "Recent" (only those present in items)`; `1 character does not call getProfiles`; `2+ characters calls it once after 250 ms with {search, page_size:5}`; `typing fast fires one request`; `a slow response for an old query is ignored when a newer query was typed` (resolve out of order); `user results render under "Users" and Enter on one navigates to /admin/users?q=<username> and closes`; `a failed search shows no users and no error crash`; `ArrowDown walks pages then users in one list`; `selecting a page pushes a recent`.
- [ ] **Step 5: Implement** in `AdminCommandPalette.tsx`: a `useUserSearch(query)` local hook (debounce + counter); unify the option list as `{kind:"page"|"user", ...}` so the existing arrow/Enter logic stays one code path.
- [ ] **Step 6: Failing tests for `?q=`:** `DataTable initialSearch="ana" starts with "ana" in the search box and filters rows`; `UsersPage with ?q=ana` shows it. **Step 7: Implement** `initialSearch` (`useState(initialSearch ?? "")`) and thread `q` from `useSearchParams` in `UsersPage`.
- [ ] **Step 8: Run** `npx vitest run src/components src/pages/admin` and `node scripts/modal-audit.mjs`, `node scripts/table-header-audit.mjs` → PASS/exit 0; keyboard-only + 375px check in the browser pane.
- [ ] **Step 9: Commit** `feat(admin): palette recents and user search`.

## Task 3: Palette in the main app

**Files:**
- Create: `frontend/src/components/layout/CommandPalette.tsx` (+ `.test.tsx`)
- Modify: `AdminCommandPalette.tsx` (becomes a wrapper), `AppShell.tsx`, `AppShell` tests

**Interfaces:**
- Produces:
  ```ts
  export interface PaletteItem { path: string; label: string; group: string; icon: React.ElementType }
  // Generic palette: items, open, onOpenChange, optional userId (recents), optional `userSearch?: boolean` (default false)
  export const CommandPalette: React.FC<{ items: PaletteItem[]; open: boolean; onOpenChange(o: boolean): void; userId?: number; userSearch?: boolean }>;
  export const navItemToPaletteItem: (i: NavItem) => PaletteItem;   // group = NAV_SECTION_LABELS[i.section]
  ```
- `AdminCommandPalette` = `<CommandPalette items={items} userSearch .../>` (an `AdminNavItem` is already a `PaletteItem`). The main app passes `userSearch={false}` (employees must not search users).

- [ ] **Step 1: Move** the body of `AdminCommandPalette.tsx` into `CommandPalette.tsx`, keep `AdminCommandPalette.test.tsx` green unchanged (regression gate), and add `CommandPalette.test.tsx` cases: `userSearch=false never calls getProfiles`, `navItemToPaletteItem maps section to its label`.
- [ ] **Step 2: Failing AppShell tests:** `Ctrl+K opens the palette with the viewer's visible nav items`, `no user search`, `existing HeaderSearch box still present`.
- [ ] **Step 3: Implement** the hotkey in `AppShell` (same listener contract as `AdminShell`), reuse `visibleItems`.
- [ ] **Step 4: Run** `npx vitest run src/components/layout` + modal-audit → PASS. **Step 5: Commit** `feat(app): Ctrl+K palette in the main shell`.

## Task 4: Dashboard presets

**Files:**
- Create: `frontend/src/config/dashboardPresets.ts` (+ test), `frontend/src/pages/admin/components/DashboardPresetMenu.tsx` (+ test)
- Modify: `frontend/src/context/DashboardContext.tsx` (+ test), `AdminDashboardPage.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface DashboardPreset { id: string; label: string; description: string; widgetIds: string[] }
  export const DASHBOARD_PRESETS: DashboardPreset[];  // "approver", "workforce", "trends", "everything-default"
  export function resolvePresetWidgets(p: DashboardPreset, available: { id: string; superuserOnly?: boolean }[], isSuperuser: boolean): string[];
  // DashboardContext: updateLayout now runs through the same save queue as add/removeWidget
  ```
- Preset contents: `approver` = pending-approvals, pending-backlog, approval-aging, approver-sla, rejection-analysis, period-close, approval-status; `workforce` = total-users, total-teams, org-headcount, coverage-gaps, role-distribution, tech-distribution; `trends` = overtime-hours, hours-overview, ot-standby-trend, leave-trend, ot-by-client, team-comparison, who-is-out; `everything-default` = the ids of `defaultAdminLayout`.

- [ ] **Step 1: Failing tests `dashboardPresets.test.ts`:** `every preset id exists in AVAILABLE_WIDGETS`; `resolvePresetWidgets drops unknown ids`; `drops superuserOnly ids for non-superusers, keeps them for superusers`; `preserves preset order`.
- [ ] **Step 2: Failing context test:** `updateLayout and addWidget issued together never overlap saves and the last save is the layout from the later call` (same harness as the existing rapid-toggle tests).
- [ ] **Step 3: Implement** `resolvePresetWidgets`, presets, and route `updateLayout` through `commit` (keeps the returned `Promise<void>` signature: resolve when its queued save settles).
- [ ] **Step 4: Failing menu tests:** `menu lists presets with descriptions`, `choosing one calls updateLayout once with the resolved widgets laid out in a 4-column grid`, `a confirm step names the preset before replacing the current layout` (use `ConfirmDialog`), `cancel leaves the layout alone`.
- [ ] **Step 5: Implement** `DashboardPresetMenu` (Radix `Popover` + `ConfirmDialog`), mount in the page actions next to "Reset to Default". Presets only reference widget ids; they never grant visibility (`isWidgetActive` + `superuserOnly` gates in the widgets stay the authority).
- [ ] **Step 6: Run** `npx vitest run src/config src/context src/pages/admin` + modal-audit → PASS. **Step 7: Commit** `feat(admin): dashboard presets`.

## Task 5: Dashboard PDF export

**Files:**
- Modify: `frontend/src/components/dashboard/ChartCard.tsx` (optional `sectionId?: string` → `data-chart-section`), `dashboard-widgets/WidgetFrame.tsx` (pass `sectionId`), the 3 existing ChartCard widgets (`HoursChartWidget`, `ApprovalAgingWidget`, `ApprovalStatusWidget`) and the 9 new ones (give each a stable id equal to its widget id), `AdminDashboardPage.tsx`
- Create: `frontend/src/pages/admin/components/ExportDashboardPdfButton.tsx` (+ test)

**Interfaces:**
- Consumes: `captureChartsToPdf(container, { title, filename, generatedBy, periodLabel })` (`components/visualization/pdfExport.ts`; captures `[data-chart-section]` nodes in DOM order, no-ops with none).
- Produces: `ExportDashboardPdfButton` props `{ containerRef: React.RefObject<HTMLElement | null> }`; filename `admin-dashboard-YYYY-MM-DD.pdf`; title `Admin Dashboard`; `generatedBy` = `user.full_name || user.username` via `useAuth`.

- [ ] **Step 1: Failing tests:** `ChartCard sets data-chart-section only when sectionId is passed`; button: `dynamically imports pdfExport only on click` (spy: module not loaded at render — assert `vi.doMock` factory not invoked before click), `calls captureChartsToPdf with the container, title, filename pattern and user name`, `disabled with aria-busy while exporting`, `no capturable section → shows a toast "Nothing to export" and does not call captureChartsToPdf`, `a thrown export re-enables the button and toasts an error`, `skeleton placeholders are not captured` (placeholder elements carry no `data-chart-section`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** the attribute plumbing and the button (`await import("@/components/visualization/pdfExport")` inside the handler; check `container.querySelector("[data-chart-section]")` first).
- [ ] **Step 4: Wire** a `ref` on the widget area in `AdminDashboardPage.tsx` and the button in the page actions.
- [ ] **Step 5: Run** `npx vitest run src/components src/pages/admin` → PASS; `ANALYZE=true npm run build` (or plain build) → `jspdf`/`html2canvas` stay out of the dashboard chunk (note chunk sizes in the PR); browser check: export with trends widgets on, open the PDF.
- [ ] **Step 6: Commit** `feat(admin): export the dashboard charts to PDF`.

## Task 6: Trend period selector

**Files:**
- Modify: `apps/dashboard/admin_trends.py`, `apps/dashboard/viewsets.py` (`admin_trends`), `apps/dashboard/tests/test_admin_trends.py`, `frontend/src/types/index.ts`, `services/dashboardService.ts`, `hooks/useAdminDashboardQueries.ts`, `dashboard-widgets/TrendsSection.tsx` (+ `AdminAggregateSections.test.tsx`), `OtStandbyTrendWidget.tsx`, `LeaveTrendWidget.tsx`
- Create: `dashboard-widgets/TrendPeriodSelect.tsx` (+ test)

**Interfaces:**
- Produces (backend): `build_admin_trends(user, today: date | None = None, months: int = 12) -> dict` — `months` ∈ [3, 24]; the module constant `MONTHS` becomes the default; all month-series lengths equal `months`; `overtime_by_client`, `team_comparison`, `who_is_out` stay current-month/today. View: `?months=` parsed with `int()`, **400** `{"months": "must be an integer between 3 and 24"}` outside range or non-integer; absent → 12.
- Produces (frontend): `dashboardService.getAdminTrends(months?: number)`; `useAdminTrends(enabled: boolean, months: number)` with key `["admin","trends", months]` (prefix-invalidated by `["admin","trends"]`); `TrendPeriodSelect: { value: 3|6|12|24; onChange(v): void }`, options 3/6/12/24 months; the selected value lives in `?months=` via `useUrlParamState("months", ["3","6","12","24"], "12")` (Task 1 hook).

- [ ] **Step 1: Failing backend tests:** `months=6 returns 6 months ending in the current month and every series has length 6`; `months=24 → 24`; default → 12; `months=2|25|0|-1|abc|3.5|"" → 400 with the message, not 500`; `months does not change overtime_by_client/team_comparison/who_is_out`; `staff-only still 403 for employee with ?months=6`; `query count independent of months` (compare 3 vs 24 months, counts equal).
- [ ] **Step 2: Run** `py -3.14 manage.py test apps.dashboard.tests.test_admin_trends` → FAIL.
- [ ] **Step 3: Implement** `_window(today, months)`, thread `months` through `_monthly_hours`/`_leave_days`/`build_admin_trends`; validate in the viewset before calling the builder.
- [ ] **Step 4: Run** the module → PASS; `python -m ruff check --output-format=concise apps/dashboard`.
- [ ] **Step 5: Failing frontend tests:** `TrendPeriodSelect renders four options and reports changes`; `TrendsSection requests with the months from the URL and refetches when it changes` (service spy called with 6 then 12); `chart aria-label mentions the period ("last 6 months")`; `widget descriptions use the period`.
- [ ] **Step 6: Implement** the selector (shown once, top of the trends grid; hidden when no trend widget is on), thread `months` into `useAdminTrends` and the two charts' copy.
- [ ] **Step 7: Run** `npx vitest run src/pages/admin src/hooks` + `npx tsc --noEmit` → PASS. **Step 8: Commit** `feat(dashboard): selectable trend period (3-24 months)`.

## Task 7: Close-out

**Files:** `frontend/e2e/admin-dashboard.spec.ts`, `AGENTS.md`, `CLAUDE.md` (Hot Invariant line), this plan's "Not building" stays authoritative.

- [ ] **Step 1: E2E additions** (admin storage, per `reference_e2e_runbook`): `insight "Open" for stale approvals lands on a leave/overtime page with the pending filter active (?status=pending)`; `Ctrl+K, typing a seeded username shows it under Users and Enter lands on /admin/users?q=`; `choosing the "Approver view" preset shows only its widgets after reload`; `?months=6 renders and /api/dashboard/widgets/admin_trends/?months=99 returns 400`; `Export PDF triggers a download named admin-dashboard-*.pdf` (Playwright `waitForEvent("download")`).
- [ ] **Step 2: Full pass once:** `py -3.14 manage.py makemigrations --check; py -3.14 manage.py test; python -m ruff check --output-format=concise apps/dashboard` and `cd frontend; npx tsc --noEmit; npx vitest run; npx eslint src --quiet; node scripts/modal-audit.mjs; node scripts/table-header-audit.mjs; npx fallow dead-code --quiet; npm run build`, then the Playwright specs `admin-dashboard`, `role-workflows`, `visual-guards`, `preferences` → all pass.
- [ ] **Step 3: Browser verification** at 1280 dark/light and 375: preset menu, palette (recents, user search, main-app Ctrl+K), trend selector, PDF button; watch the console for React warnings.
- [ ] **Step 4: Docs:** `AGENTS.md` entry (deep-link params, palette recents/user search, presets are config-only, `?months=` contract) and one `CLAUDE.md` Hot Invariant (palette user search must stay behind `userSearch` and server-scoped; presets never grant visibility).
- [ ] **Step 5: Commit** `docs/test: admin dashboard follow-ups`.

---

## Self-Review

**Spec coverage.** Ideas 1–3, 6, 7 → Tasks 1, 2+3, 4, 5, 6 (palette v2 split in two); idea 4 (cache) and 5 (digest) → "Not building" with reasons; verification and docs → Task 7. Each Review Focus line has a named test: hostile input (T1 Step 1/4, T2 Step 6, T6 Step 1), search race and scope (T2 Step 4, T3 Step 1), presets not widening access (T4 Step 1), export edge cases (T5 Step 1), stale state (T6 Step 5, T4 Step 2).

**Step scan.** Signatures and exact test names/assertions are given; thresholds (2 chars, 250 ms, 5 recents, months 3–24) are stated once and reused.

**Type consistency.** `useUrlParamState` (T1) is consumed by T6; `PaletteItem`/`CommandPalette` (T3) wrap the T2 behaviour, so T3 must follow T2; `updateLayout` queueing (T4) builds on PR #55's `commit`; `captureChartsToPdf` signature matches `components/visualization/pdfExport.ts`.

**Proportion.** About 6 small PRs for 5 features; no function bodies, only contracts and tests.

## Decisions you may want to overrule

1. Presets are fixed in code (no server-stored or pushed presets) — a superuser-managed set needs a table and a spec.
2. The PDF captures chart cards only (the 12 `ChartCard`-based widgets), not the stat cards; adding stat cards means giving `StatCard` the same attribute.
3. Palette user search is admin-only; the main-app palette stays navigation-only on purpose.
4. Insight deep links go as far as `?status=pending`; "older than 15 days" needs a server filter on `submitted_at` and is not included.
