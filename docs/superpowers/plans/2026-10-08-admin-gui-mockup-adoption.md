# Admin GUI Mockup Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the useful behaviour of the new `AdminGUI` mockup (dashboard insights, richer dashboard widgets, command palette, a few page conveniences) into the real admin panel, backed by real data and the existing permission model, and leave the mockup's mock-only parts behind.

**Architecture:** The real admin is already a mature, server-driven app (server pagination, role/CR scoping, plugin gating, per-user layouts stored on the backend). The mockup is a single-page, mock-data prototype. So nothing is copied wholesale: each adopted idea is rebuilt on existing primitives (`GlassCard`, `StatCard`, `DashboardSectionShell`, `tone.ts`, `lib/motion.ts`, `Dialog`) and fed by either the existing `admin_overview` payload or two new staff-only aggregate endpoints. Five phases, each its own PR off `main`, each shippable alone.

**Tech Stack:** Django 6 / DRF (`apps/dashboard`), React 19, Tailwind 4 tokens, TanStack Query, recharts 3, framer-motion, Radix `Dialog`/`Tabs`, vitest + RTL, Django `TestCase`.

**Spec:** the 2026-10-08 chat request ("adapt the `Downloads/AdminGUI` mockup to our site, add its cool functions, remove bloat, no breakage, with optimisation") + the Mockup Disposition table below. Context files: `.devin/context/03-FRONTEND-PATTERNS.md` (§10, §13, §15, §18), `.devin/context/04-API-PATTERNS.md`, `.devin/context/12-VISUAL-VERIFICATION.md`, `DESIGN.md`, `docs/table-header-contract.md`.

## Global Constraints

- **Design identity stays "Obsidian Enterprise"** (`DESIGN.md`): Plus Jakarta Sans, tokens only, violet-in-dark `primary`. The mockup's Inter/blue/raw `slate-*`/hex/gradient look is NOT ported. Zero raw hex, zero `slate-/zinc-/gray-` classes, status colour via `toneSurfaceClass`/`tone-*` tokens, chart colour via `hsl(var(--chart-N))`.
- Run Django commands with `py -3.14` (production is Django 6.1.1; default `python` is 5.2). Use quiet flags; run only targeted tests while iterating, the full suite once at the end.
- No new npm or pip dependency. `cmdk`, the mockup's `motion`, `@google/genai`, `express` are not added.
- New endpoints are `IsAdminUser` (staff) like `admin_overview` (`apps/dashboard/viewsets.py:180`); never `IsHR` (they list coverage gaps and per-approver data). Decimals become floats at the boundary. No per-row ORM loops for counts: grouped aggregates only. Business-day maths uses `count_business_days` (`apps/leave_management/models/core.py:19`).
- Core code must not statically import a plugin's modules (Plugin removal safety). Anything the core dashboard needs from `plugins/tl_scorecard/**` is copied to `frontend/src/lib/`, not imported.
- Every new `motion.*` is reduced-motion-safe (`useMotionTransition()` / `useReducedMotion()`); recharts animation is off under reduced motion. New dialogs: `size` prop only, `padded={false}`/`hideClose` as needed, one `DialogBody`; `node scripts/modal-audit.mjs` exit 0.
- Query keys include every result-changing parameter. Frontend plugin URLs: axios `baseURL` already ends in `/api`.
- Every new widget has loading skeleton, `ErrorCard` + retry on `isError`, `EmptyState` when there is no data, a 320px layout, and a light/dark check.
- Never commit or push unless asked. One PR per phase, branched from fresh `main`.

## Review Focus

1. **Wrong viewer reaches new data:** employee, TL, HR-only and CR-only admin hitting `admin_trends` / `admin_people` → 403; CR-only admins must not see palette entries they cannot open (Tasks 5, 7, 9 tests).
2. **Stale saved layouts:** a stored layout containing removed/unknown widget ids, or lacking the new ids, must neither crash nor auto-enable the new widgets (the backend stores `layout` as free JSON with no id whitelist, so nothing else guards this) (Task 4).
3. **Dismissed insight:** dismissing "3 stale approvals" must not hide it when the count becomes 7, must not leak to another admin on the same browser, and `localStorage` throwing must not break the strip (Task 2).
4. **Acting on an insight leaves it stale:** approve/reject/delete mutations today invalidate only their own list, and the dashboard queries have a 5-minute `staleTime` with no focus refetch, so "15 stale approvals" would still show after clearing them (Task 4A).
5. **Cost of the dashboard load:** adding ~9 widgets must not add per-row queries, scan unindexed columns, or fire requests for widgets that are off or hidden by the plugin/permission gate; empty org (zero rows) must give zero-filled series and `null` per-capita, never `NaN` (Tasks 5, 6, 7, 8).

## Mockup Disposition

Verified by reading both trees (2026-10-08). "Real" = what exists today.

| Mockup piece | Verdict | Reason / where |
|---|---|---|
| Automated insights strip (dismissible, pager, drill-down) | **Adopt** (Phase 1) | Derivable from the existing `admin_overview` payload; no backend. |
| Section quick-jump tabs on dashboard | **Adopt** (Phase 1) | Pure view filter; deep-linkable via `?section=`. |
| Widgets grouped by section in Customize modal | **Adopt** (Phase 1) | Real list is a flat 22-item list. |
| "Sync Telemetry" button | **Adopt, made real** (Phase 1, Task 4A) | Mockup fakes it with a timer; the real one refetches the dashboard queries and shows "Updated Nm ago". |
| Role/tech distribution, approver SLA, rejection analysis | **Adopt** (Phase 3) | Data exists (`UserProfile`, `UserTech`, `approved_by/approved_at/submitted_at/rejection_reason`). |
| 12-month OT/standby/leave trends, OT by client, team comparison, who's-out-today | **Adopt** (Phase 2) | Data exists (`date`, `hours`, `status`, `client`, leave `start/end_date`). |
| Ctrl/Cmd+K command palette | **Adopt** (Phase 4) | Real has only the `HeaderSearch` popover (no admin equivalent). Built on `Dialog`, navigation only. |
| Leave balances "at risk" view | **Adopt** (Phase 5) | Real has `is_carry_over` + `expires_at`, no filter. |
| Admin OT/standby CSV export | **Adopt** (Phase 5) | `overtimeService.exportCsv` exists; admin Overtime/Standby pages have no button. |
| Sidebar active-bar, collapse, theme, install button, mobile drawer | **Skip** | Real `AdminSidebar`/`SidebarNavLink` already do all of it, with tests and a11y. |
| Page `AnimatePresence` fade, toasts | **Skip** | Real has `MainContentTransition` and `sonner`. |
| Global **period selector** (7d/30d/month/year) | **Skip** | No backend parameter exists; a selector that changes nothing is a lie. Trend widgets are fixed 12-month. |
| Table ↔ Cards view switcher (Users/Teams/Clients) | **Defer** | Real tables are server-paginated `DataTable`s; a second renderer is a separate spec. |
| Users slide-over profile drawer, bulk-edit modal | **Skip** | Real has edit dialog + `UserBulkCommandDrawer` with CR scoping. |
| Clients: tier/sector/country/contract/SLA terms; Wages: currency toggle, tiers, CBA ref; Overtime: hub/multiplier; Teams: SLA health/active tickets; HBPR "active cases" | **Skip** | Fields do not exist in the models (`Client` = name/code/description/is_active). Would need a schema spec first. |
| Resource Access permission matrix, Plugins webhook/token config, Ticket KPI SLA tiers + calculator, Reports catalogue, Data-import fake wizard, Calendar "feeds" tab | **Skip** | Real models are group-based access, manifest-based plugin config, KPI mappings/uploads, live reports, real `ImportBatch`. Mock-only. |
| Payroll, Extensions, System pages (the unfinished last menu items) | **Skip** | As instructed; real pages exist. |
| Dashboard widgets: payroll run, audit trend, plugin inventory, notification health, storage, skills, scorecard, survey, ticket KPI | **Defer** | Each needs its own plugin permission + shape check; several already have dedicated dashboards. `Notification` has no delivery status, so "delivery health" cannot exist. |
| Bento chart (hand-drawn SVG, sinusoid data), `AggregateCard`/`ChartCard` copies, `ChartAxisGrid` | **Skip** | Fake data / real already has them on recharts. |
| Dead files inside the mockup: `Header`, `CommandPalette` (old props), `ServicesHealth`, `ResourceGauge`, `UserManagement`, `AuditLogs`, `SettingsPanel`, `ModernChart`, `MetricCard`, `mockData`, `ui/separator`, `ui/tooltip`; branding "DMF Enterprise", `v2.6-admin`, flag emoji | **Skip** | Not imported by `App.tsx`; branding is not ours (`useSiteBranding` owns it). |

**Real-repo bloat/defects found while auditing (fixed in this plan):**
- Admin dashboard drag-and-drop is a no-op: `DndContext`/`SortableContext` wrap the page but nothing calls `useSortable`, `reorderWidgets` never persists, and the modal promises "Drag and drop to reorder" (Task 4 removes the dead wiring and the false copy).
- Customize modal "Save Changes" only closes the dialog; toggles already persist on click (Task 4).
- Dashboard data goes stale after the admin acts on it: approve/reject/delete mutations do not invalidate `["admin","overview"]` (Task 4A).
- `frontend/src/lib/export-leave-requests.ts` writes `reason` unsanitised → CSV/formula injection, and breaks on quotes/newlines (Task 10).
- `frontend/src/pages/admin/NotificationEventsPage.tsx` is an empty tracked file with no importer (Task 1). (`CalendarManagementPage.tsx.backup` is untracked; leave it.)

**Already fine (checked, no work):** the service worker treats `/api/` as network-only, so the new aggregate endpoints are never cached across users; `AuthContext` calls `queryClient.clear()` on logout, so cached admin data does not leak between accounts; the backend stores a dashboard `layout` as free JSON, so new widget ids need no server change.

## File Structure

**Backend**
- Create `apps/dashboard/admin_trends.py` — org-wide time series + who's-out aggregates.
- Create `apps/dashboard/admin_people.py` — role/tech distribution, approver SLA, rejection analysis.
- Modify `apps/dashboard/viewsets.py` — add `admin_trends` and `admin_people` actions beside `admin_overview` (line ~180).
- Create `apps/dashboard/tests/test_admin_trends.py`, `apps/dashboard/tests/test_admin_people.py` (pattern of `test_admin_overview.py`).

**Frontend**
- Create `frontend/src/lib/adminInsights.ts`, `adminDashboardKeys.ts`, `csvSafe.ts` (+ tests).
- Create `frontend/src/pages/admin/components/AdminInsightsStrip.tsx`, `AdminDashboardFreshness.tsx` (+ tests), `hooks/useDismissedInsights.ts`.
- Modify `frontend/src/config/dashboardWidgets.ts` — add `section`, `ADMIN_DASHBOARD_SECTIONS`, new widget entries.
- Modify `AdminDashboardPage.tsx`, `components/AdminDashboardWidgets.tsx`, `hooks/useAdminDashboardPage.ts`, `components/admin/CustomizeDashboardModal.tsx`.
- Create `dashboard-widgets/{TrendsSection,OtStandbyTrendWidget,LeaveTrendWidget,OtByClientWidget,TeamComparisonWidget,WhoIsOutWidget,PeopleSection,RoleDistributionWidget,TechDistributionWidget,ApproverSlaWidget,RejectionAnalysisWidget,chartStyle}.ts(x)` (+ tests).
- Modify `types/index.ts`, `services/dashboardService.ts`, `hooks/useAdminDashboardQueries.ts`, and the mutation hooks listed in Task 4A.
- Create `components/layout/AdminCommandPalette.tsx` (+ test); modify `AdminShell.tsx`, `AdminSidebar.tsx`.
- Modify `lib/export-leave-requests.ts`, `pages/admin/LeaveBalancesPage.tsx`, `pages/admin/components/HoursLogsPage.tsx`.
- Create `frontend/e2e/admin-dashboard.spec.ts`.
- Delete `frontend/src/pages/admin/NotificationEventsPage.tsx`.

---

## Phase 0 — Baseline

### Task 1: Hygiene and visual baselines

**Files:**
- Delete: `frontend/src/pages/admin/NotificationEventsPage.tsx`

- [ ] **Step 1: Confirm it is unreferenced.** Run `git grep -n NotificationEventsPage -- frontend` → only the file itself (no import, no route). Expected: no matches outside the file.
- [ ] **Step 2: Delete it.** `git rm frontend/src/pages/admin/NotificationEventsPage.tsx`.
- [ ] **Step 3: Capture admin baselines** per `.devin/context/12-VISUAL-VERIFICATION.md` (both servers running, E2E runbook in memory `reference_e2e_runbook`): `cd frontend; node scripts/visual-verify.mjs capture` limited to the admin role. Expected: fingerprints written under `design-fingerprints/` (gitignored). Every later phase ends with `verify`/`diff` against these.
- [ ] **Step 4: Verify** `cd frontend; npx tsc --noEmit` exit 0.
- [ ] **Step 5: Commit** `chore(admin): remove empty NotificationEventsPage`.

---

## Phase 1 — Dashboard insights, sections, customize modal (frontend only)

### Task 2: `deriveAdminInsights` + `AdminInsightsStrip`

**Files:**
- Create: `frontend/src/lib/adminInsights.ts`, `frontend/src/lib/adminInsights.test.ts`
- Create: `frontend/src/pages/admin/hooks/useDismissedInsights.ts`
- Create: `frontend/src/pages/admin/components/AdminInsightsStrip.tsx`, `AdminInsightsStrip.test.tsx`
- Modify: `frontend/src/pages/admin/AdminDashboardPage.tsx` (render the strip under `PageShell` actions, above the widgets)

**Interfaces:**
- Consumes: `AdminOverview` (`frontend/src/types/index.ts:382`), `useAdminOverview(true)` (`hooks/useAdminDashboardQueries.ts` — same key `["admin","overview"]`, so no second request), `toneSurfaceClass` / `Tone` (`components/ui/tone.ts`).
- Produces:
  ```ts
  export type InsightSeverity = "critical" | "warning" | "info" | "positive";
  export interface AdminInsight {
    id: string;            // stable rule id, e.g. "aging-stale"
    signature: string;     // id + the numbers it was derived from, e.g. "aging-stale:7"
    severity: InsightSeverity;
    title: string;
    message: string;
    to?: string;           // existing /admin route
    actionLabel?: string;
  }
  export function deriveAdminInsights(overview: AdminOverview): AdminInsight[]; // most severe first
  export function useDismissedInsights(userId: number | undefined): { isDismissed(signature: string): boolean; dismiss(signature: string): void };
  ```

Rule table (the only decisions the implementer cannot make alone; thresholds verbatim):

| id | fires when | severity | `to` |
|---|---|---|---|
| `aging-stale` | sum of `approval_aging.*[3]` (the `15d+` bucket) > 0 | `critical` if ≥ 5 else `warning` | route of the type with the largest `15d+` count: overtime→`/admin/overtime-logs`, standby→`/admin/standby-logs`, leave→`/admin/leave-requests` |
| `gap-team-leader` | `coverage_gaps.teams_without_leader` > 0 | warning | `/admin/teams` |
| `gap-employee-tl` | `coverage_gaps.employees_without_tl` > 0 | warning | `/admin/users` |
| `gap-hbpr` | `coverage_gaps.al_tls_without_hbpr_assignment` > 0 | warning | `/admin/hbpr-assignments` |
| `carryover-risk` | `carryover_expiry.days_at_risk` > 0 | warning | `/admin/leave-balances` |
| `period-open` | `period_close.tls_open` > 0 | `warning` if `tls_open*2 > tls_total` else `info` | `/admin/overtime-logs` |
| `backup-stale` | `backup !== null && (backup.count === 0 \|\| backup.stale)` | critical | `/admin/backup-restore` |
| `all-clear` | no rule above fired | positive | none |

`signature` = `${id}:${n}` where `n` is the count the rule keys on (e.g. total 15d+, `days_at_risk` rounded to 1 decimal).

- [ ] **Step 1: Write failing tests** in `adminInsights.test.ts` using an `AdminOverview` fixture (copy the one in `OverviewWidgets.test.tsx`):
  - `empty org returns only all-clear` (all counts 0, `backup: null`) → `[ {id:"all-clear", severity:"positive"} ]`.
  - `15d+ bucket of 5 is critical, 4 is warning` and `to` follows the largest type.
  - `one rule per id, ordered critical → warning → info → positive`.
  - `backup null (non-superuser) never yields backup-stale`; `backup.count 0` yields critical.
  - `signature changes when the count changes` (`aging-stale:3` vs `aging-stale:7`).
  - `period-open is warning only when more than half the TLs are open`.
- [ ] **Step 2: Run** `cd frontend; npx vitest run src/lib/adminInsights.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement `deriveAdminInsights`** in `lib/adminInsights.ts` as a pure function following the rule table; sort by severity rank `critical>warning>info>positive`.
- [ ] **Step 4: Write failing component tests** in `AdminInsightsStrip.test.tsx` (mock `useAdminOverview`):
  - `renders one insight at a time with "1 / N" pager and prev/next buttons that have accessible names`.
  - `action button navigates to insight.to` (MemoryRouter + `useNavigate` assertion on location).
  - `dismiss hides that signature and persists it`; re-render with the same data → still hidden.
  - `dismissed insight reappears when its signature changes` (data 3 → 7).
  - `dismissals are per user: user 1 dismissing does not hide the insight for user 2 on the same browser` (key `admin.dashboard.dismissedInsights.<userId>`; no userId -> in-memory only).
  - `localStorage.getItem throwing does not break rendering` (spy that throws) and dismiss still hides it for the session.
  - `renders nothing while loading and an inline retry on error` (`ErrorCard`-style compact retry; not a full card).
  - `container is role="region" aria-label="Automated insights"; severity is conveyed in text, not colour alone`.
- [ ] **Step 5: Implement `useDismissedInsights`** (localStorage key `admin.dashboard.dismissedInsights.<userId>`, JSON array of signatures capped at 50, every access in `try/catch`, in-memory fallback) **and `AdminInsightsStrip`**: `GlassCard`-free slim bar using `toneSurfaceClass[tone]` (critical→danger, warning→warning, info→info, positive→success), one entry visible, framer-motion enter via `fadeSlideUp` + `useMotionTransition`, lucide icon per severity, pager buttons ≥ 24×24 (`min-h-6`).
- [ ] **Step 6: Mount** in `AdminDashboardPage.tsx` inside `AdminDashboardContent` above `<DndContext>`'s replacement (Task 4 removes DnD; until then mount above it).
- [ ] **Step 7: Run** `npx vitest run src/lib/adminInsights.test.ts src/pages/admin/components/AdminInsightsStrip.test.tsx src/pages/admin/AdminDashboardPage.test.tsx` → PASS; `npx eslint src/lib src/pages/admin` clean.
- [ ] **Step 8: Commit** `feat(admin): automated insights strip on the dashboard`.

### Task 3: Section tabs

**Files:**
- Modify: `frontend/src/config/dashboardWidgets.ts`, `frontend/src/pages/admin/AdminDashboardPage.tsx`, `frontend/src/pages/admin/components/AdminDashboardWidgets.tsx`
- Test: `frontend/src/config/dashboardWidgets.test.ts` (create), `frontend/src/pages/admin/AdminDashboardPage.test.tsx` (extend)

**Interfaces:**
- Produces:
  ```ts
  export type AdminDashboardSection = "overview" | "approvals" | "trends" | "leave" | "system" | "shortcuts";
  export const ADMIN_DASHBOARD_SECTIONS: { id: AdminDashboardSection; label: string }[]; // order = tab order
  // WidgetConfig gains:  section: AdminDashboardSection
  export const widgetSection: (widgetId: string) => AdminDashboardSection | undefined;
  ```
- Section map (existing ids only in this task): `overview`: total-users, total-teams, org-headcount, coverage-gaps; `approvals`: pending-approvals, pending-backlog, approval-aging, approval-status, period-close; `trends`: overtime-hours, hours-overview; `leave`: leave-utilization, carryover-expiry; `system`: recent-activity, backup-status; `shortcuts`: users, teams, clients, permissions, calendar-mgmt, reports, holiday-balances. Tabs: "All" + the six labels (`Overview`, `Approvals`, `Hours & Trends`, `Leave`, `System`, `Shortcuts`).

- [ ] **Step 1: Failing tests.** `dashboardWidgets.test.ts`: `every AVAILABLE_WIDGETS entry has a section in ADMIN_DASHBOARD_SECTIONS`; `widget ids are unique`. `AdminDashboardPage.test.tsx`: `?section=approvals shows approval widgets and hides total-users`; `selecting a tab writes ?section= and keeps other query params`; `unknown ?section= falls back to All`; `tab change does not call saveDashboardLayout/addWidget/removeWidget` (view filter only).
- [ ] **Step 2: Run** targeted vitest → FAIL.
- [ ] **Step 3: Implement** `section` on every `AVAILABLE_WIDGETS` entry and the exports above. In `AdminDashboardPage.tsx` use `useSearchParams` and the Radix `Tabs` from `@/components/ui/tabs` (scrollable row on mobile). Pass `AdminDashboardWidgets` a wrapped `isWidgetActive = (id) => isWidgetActive(id) && (section === "all" || widgetSection(id) === section)` — nothing else in the widget components changes. `OverviewSection`'s "mount the request only while a widget is on" check uses this same wrapped predicate, so hidden sections fire no overview request.
- [ ] **Step 4: Run** `npx vitest run src/config src/pages/admin/AdminDashboardPage.test.tsx src/pages/admin/components` → PASS.
- [ ] **Step 5: Commit** `feat(admin): dashboard section tabs`.

### Task 4: Customize modal and dead DnD removal

**Files:**
- Modify: `frontend/src/components/admin/CustomizeDashboardModal.tsx`, `frontend/src/pages/admin/AdminDashboardPage.tsx`, `frontend/src/pages/admin/hooks/useAdminDashboardPage.ts`, `frontend/src/context/DashboardContext.tsx`
- Test: `CustomizeDashboardModal.test.tsx` (create), `useAdminDashboardPage` test (extend or create), `AdminDashboardPage.test.tsx`

**Interfaces:**
- Consumes: `ADMIN_DASHBOARD_SECTIONS`, `WidgetConfig.section` (Task 3).
- Produces: `CustomizeDashboardModal` props unchanged except `availableWidgets` items now carry `section`. `useAdminDashboardPage()` no longer returns `sensors`/`handleDragEnd`. `DashboardContext.reorderWidgets` is removed (it had no caller after DnD removal).

- [ ] **Step 1: Failing tests.** Modal: `renders one heading per section that has widgets, widgets listed under their heading`; `toggling a checkbox calls onToggleWidget(id) and nothing else`; `footer has a single "Done" button that closes (no "Save Changes")`; `description does not mention drag and drop`. Page: `no DndContext in the tree` (assert no `[aria-roledescription="sortable"]`/dnd announcements), `Reset to Default still calls resetLayout`. Layout robustness (Review Focus 3): `a saved layout containing an unknown id "removed-widget" renders without error and the id is ignored`; `new widget ids absent from a saved layout stay hidden`.
- [ ] **Step 2: Run** → FAIL. Also update the `vi.mock("./hooks/useAdminDashboardPage")` factory in `AdminDashboardPage.test.tsx` (it returns `sensors`/`handleDragEnd`, which no longer exist); the existing header assertions (`Admin` tab, `Team Leader` tab) must still pass alongside the new section tabs.
- [ ] **Step 3: Implement.** Group the modal list by section (headings use `ModalSection`/existing label style; section order from `ADMIN_DASHBOARD_SECTIONS`); replace description with "Choose which widgets appear on your dashboard. Changes apply immediately."; replace the Cancel/Save pair with one `Done` button. Remove `DndContext`, `SortableContext`, sensors, `handleDragEnd` and the `@dnd-kit` imports from the admin dashboard files only (other `@dnd-kit` users are untouched — `git grep "@dnd-kit"` before and after; the dependency stays). Remove `reorderWidgets` from `DashboardContext` only after `git grep reorderWidgets` shows no other caller.
- [ ] **Step 4: Run** `npx vitest run src/components/admin src/pages/admin src/context` and `node scripts/modal-audit.mjs` → PASS / exit 0.
- [ ] **Step 5: Phase gate.** `cd frontend; npx tsc --noEmit; npx eslint src --quiet`; visual `verify` of `/admin` (light/dark, 375/768/1280); screenshot the strip with ≥2 insights. 
- [ ] **Step 6: Commit** `feat(admin): grouped customize modal; remove non-functional dashboard drag-and-drop`. Open PR "Phase 1".

---

### Task 4A: Fresh dashboard data (invalidate on action) and a real refresh control

**Files:**
- Create: `frontend/src/lib/adminDashboardKeys.ts`, `adminDashboardKeys.test.ts`, `frontend/src/pages/admin/components/AdminDashboardFreshness.tsx`, `AdminDashboardFreshness.test.tsx`
- Modify: `frontend/src/pages/admin/hooks/useOvertimeLogsPage.ts` (approve/delete, lines ~40/~53), `useStandbyLogsPage.ts` (~34/~47), `frontend/src/hooks/useAdminRejectMutation.ts` (~38), the leave-request approve/reject hook and `useLeaveBalances`, and the users/teams/HBPR-assignment mutation hooks that change coverage gaps. **Step 1 locates each with `git grep -n "invalidateQueries" frontend/src/hooks frontend/src/pages/admin` and lists them in the PR.**
- Modify: `AdminDashboardPage.tsx` (mount the freshness control in the `PageShell` actions)

**Interfaces:**
- Produces:
  ```ts
  export const ADMIN_DASHBOARD_QUERY_KEYS: readonly (readonly string[])[]; // [["admin","overview"],["admin","trends"],["admin","people"],["admin","global-stats"]]
  export function invalidateAdminDashboard(qc: QueryClient): Promise<void>; // exactly those keys, never the bare ["admin"] prefix (would refetch every admin list)
  // AdminDashboardFreshness: "Updated 3m ago" from the oldest dataUpdatedAt of the mounted dashboard queries + a Refresh button
  ```

- [ ] **Step 1: Failing tests.** `invalidateAdminDashboard invalidates the four keys and not ["admin","overtime","admin_logs"]` (spy on `invalidateQueries`); one test per mutation site: `approving an overtime log invalidates the dashboard keys` (same for standby, reject, leave approve, balance create/update/delete). `AdminDashboardFreshness`: `renders "Updated just now" then "Updated 2m ago"` (fake timers); `Refresh calls invalidateAdminDashboard, button is disabled and aria-busy while fetching`; `shows "—" when nothing has loaded`; no spinner rotation under reduced motion.
- [ ] **Step 2: Run** `npx vitest run src/lib/adminDashboardKeys.test.ts src/pages/admin` → FAIL.
- [ ] **Step 3: Implement** the helper and call it in each mutation's `onSuccess` (one added line per site; do not restructure those hooks). `AdminDashboardFreshness` reads `useQueryClient().getQueryCache()` filtered by `ADMIN_DASHBOARD_QUERY_KEYS`, ticking every 30 s.
- [ ] **Step 4: Run** the same command plus `npx vitest run src/hooks` → PASS.
- [ ] **Step 5: Commit** `fix(admin): refresh dashboard aggregates after approvals; add refresh control`. Part of PR "Phase 1".

---

## Phase 2 — Trends (backend + widgets)

### Task 5: `admin_trends` endpoint

**Files:**
- Create: `apps/dashboard/admin_trends.py`, `apps/dashboard/tests/test_admin_trends.py`
- Modify: `apps/dashboard/viewsets.py` (add action next to `admin_overview`, `permission_classes=[IsAdminUser]`, same docstring style)

**Interfaces — response contract** (`GET /api/dashboard/widgets/admin_trends/`):
```jsonc
{
  "months": ["2025-11", "...", "2026-10"],             // 12, oldest first, current month last
  "hours": { "overtime": [f,...12], "standby": [f,...12], "pending_overtime": [f,...12] },
  "leave_days": { "vacation": [f,...12], "sick": [f,...12] },   // business days
  "overtime_by_client": [ { "client_id": 1, "name": "Acme", "hours": 41.5, "share_pct": 62.1 } ],  // current month, top 6 + {"name":"Other"} remainder, hours desc
  "team_comparison": [ { "team_id": 1, "name": "DOME", "team_size": 6, "overtime_hours": 30.0, "standby_hours": 16.0, "leave_days": 4, "overtime_per_capita": 5.0 } ], // current month; per_capita null when team_size 0
  "who_is_out": {
    "date": "2026-10-08",
    "on_leave": [ { "user_id": 1, "name": "A B", "team": "DOME", "request_type": "vacation", "until": "2026-10-10" } ],   // approved, max 20
    "on_standby": [ { "user_id": 2, "name": "C D", "team": "DOME" } ],                                                    // approved StandbyLog.date == today, max 20
    "upcoming_leave_14d": 3
  }
}
```
```python
def build_admin_trends(user, today: date | None = None) -> dict   # today defaults to timezone.localdate()
```

Decisions: only `status="approved"` counts (pending overlay is its own series); months bucket by `TruncMonth("date")`; leave days are clipped per month (a request spanning Sep 24 → Oct 6 contributes 5 business days to September and 4 to October) by iterating the ≤ 12-month window of approved requests once and calling `count_business_days(max(start, month_start), min(end, month_end))`; `team_comparison` size = `UserProfile.teams` membership count of active users; client attribution uses `OvertimeLog.client` (non-null FK) only.

- [ ] **Step 1: Write failing tests** (`AdminTrendsBase` like `AdminOverviewBase`; URL `/api/dashboard/widgets/admin_trends/`):
  - `test_employee_forbidden`, `test_hr_without_staff_forbidden`, `test_staff_ok`.
  - `test_empty_org_returns_twelve_zero_months_current_last` (pass `today=date(2026,10,8)` to `build_admin_trends`): `months[0]=="2025-11"`, `months[-1]=="2026-10"`, every series length 12 and all 0.0, `overtime_by_client==[]`, `who_is_out.on_leave==[]`.
  - `test_only_approved_hours_counted_pending_is_overlay` (approved 3h, pending 2h, rejected 5h in Sep → overtime[-2]==3.0, pending_overtime[-2]==2.0).
  - `test_leave_business_days_split_across_months` (approved vacation 2026-09-24 → 2026-10-06 ⇒ Sep 5.0, Oct 4.0; Sat/Sun ignored).
  - `test_client_share_sums_to_100_and_remainder_grouped_as_other` (8 clients ⇒ 6 named + "Other"; shares sum to 100.0 ± 0.1).
  - `test_team_comparison_per_capita_null_for_empty_team`.
  - `test_who_is_out_today_excludes_pending_and_rejected_and_caps_at_20`; `test_upcoming_leave_14d_counts_approved_starting_tomorrow_to_day_14_only`.
  - `test_query_count_independent_of_row_count`: with `CaptureQueriesContext`, query count for 3 users×logs equals the count for 30 users×logs.
- [ ] **Step 2: Run** `py -3.14 manage.py test apps.dashboard.tests.test_admin_trends -v 1` → FAIL (404/ImportError).
- [ ] **Step 3: Implement** `admin_trends.py` (small private functions per block, as `admin_overview.py` does) and the viewset action (`from .admin_trends import build_admin_trends` inside the method, matching `admin_overview`).
- [ ] **Step 4: Run** the test module → PASS. Then `py -3.14 manage.py check` and `python -m ruff check --output-format=concise apps/dashboard` clean.
- [ ] **Step 5: Commit** `feat(dashboard): admin_trends aggregate endpoint`.

### Task 6: Trend widgets

**Files:**
- Modify: `frontend/src/types/index.ts` (add `AdminTrends`), `frontend/src/services/dashboardService.ts` (`getAdminTrends()` → `/dashboard/widgets/admin_trends/`), `frontend/src/hooks/useAdminDashboardQueries.ts` (add `useAdminTrends(enabled)`, key `["admin","trends"]`, `staleTime 5*60*1000`, `refetchOnWindowFocus:false`), `frontend/src/config/dashboardWidgets.ts`, `AdminDashboardWidgets.tsx`
- Create: `dashboard-widgets/{TrendsSection,OtStandbyTrendWidget,LeaveTrendWidget,OtByClientWidget,TeamComparisonWidget,WhoIsOutWidget}.tsx` + tests

**Interfaces:**
- Consumes: Task 5 contract; `ChartCard` (`components/dashboard/ChartCard.tsx`), chart tooltip/axis style from `HoursChartWidget.tsx` (extract the two style constants to `dashboard-widgets/chartStyle.ts` and reuse in both — Smallest Viable Diff: move, don't duplicate).
- Produces: widget ids `ot-standby-trend`, `leave-trend`, `ot-by-client`, `team-comparison`, `who-is-out` (all `section: "trends"`, appended to `AVAILABLE_WIDGETS`; **not** added to `defaultAdminLayout`, so existing users see no change until they opt in). `TRENDS_WIDGET_IDS` const like `OVERVIEW_WIDGET_IDS`.

- [ ] **Step 1: Failing tests** (one file per widget, mock nothing but props):
  - Each: `shows skeleton while loading`, `shows ErrorCard with retry on error`, `shows EmptyState when the series is all zero`.
  - `OtStandbyTrendWidget`: `renders 12 category ticks`, `has role="img" with aria-label containing the latest month's overtime hours`; recharts `isAnimationActive` is false when `useReducedMotion()` is true.
  - `OtByClientWidget`: lists name + `share_pct`, "Other" last.
  - `TeamComparisonWidget`: per-capita `null` renders "—" (never "NaN"/"Infinity").
  - `WhoIsOutWidget`: shows `until` date for leave, counts, "Nobody is out today" empty state, truncation note when 20 shown.
  - `TrendsSection`: `does not call the endpoint when no trend widget is active` (spy on `dashboardService.getAdminTrends`), calls it exactly once when two are active.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** widgets with recharts + `hsl(var(--chart-N))` colours + tone tokens; `TrendsSection` mirrors `OverviewSection` (mount query only while a trend widget is active). Wire `TrendsSection` into `AdminDashboardWidgets` after `OverviewSection`.
- [ ] **Step 3b: Split the chunk.** Load `TrendsSection` (and in Task 8 `PeopleSection`) with `React.lazy` + `Suspense` (fallback = the 4-card skeleton) from `AdminDashboardWidgets`, rendered only while a widget of that section is active, so the recharts-heavy code is not fetched for admins who never enable it. Test: `section is not rendered when no trend widget is active`.
- [ ] **Step 4: Run** `npx vitest run src/pages/admin/components/dashboard-widgets src/config` → PASS; `npx tsc --noEmit`; `npx eslint src/pages/admin`.
- [ ] **Step 5: Phase gate.** Verify in CloakBrowser at 375/768/1280, light + dark, with a seeded dataset; `ANALYZE=true npm run build` — recharts must stay in the existing chunk (no new large chunk; note the bundle numbers in the PR).
- [ ] **Step 6: Commit** `feat(admin): 12-month trend and who's-out dashboard widgets`. Open PR "Phase 2".

---

## Phase 3 — People and approval quality

### Task 7: `admin_people` endpoint

**Files:**
- Create: `apps/dashboard/admin_people.py`, `apps/dashboard/tests/test_admin_people.py`
- Modify: `apps/dashboard/viewsets.py`

**Interfaces — response contract** (`GET /api/dashboard/widgets/admin_people/`, staff only):
```jsonc
{
  "roles": { "italian_tl": 0, "albanian_tl": 0, "hr": 0, "hbpr": 0, "staff": 0, "employees": 0, "employees_without_tl": 0 },
  "techs": [ { "tech_id": 1, "name": "NOC", "count": 12, "levels": [ { "code": "L1", "name": "Junior", "rank": 1, "count": 5 }, { "code": null, "name": "Ungraded", "rank": 0, "count": 1 } ] } ],
  "approver_sla": [ { "user_id": 3, "name": "A B", "decisions_30d": 21, "approval_rate_pct": 90.5, "avg_decision_hours": 14.2 } ],   // top 10 by decisions desc
  "rejections": { "month": "2026-10", "by_type": { "overtime": 2, "standby": 0, "leave": 1 }, "top_reasons": [ { "reason": "missing ticket", "count": 2 } ] }   // top 5
}
```
```python
def build_admin_people(user, today: date | None = None) -> dict
```

Decisions: roles reuse the Q-conditions of `admin_overview.coverage_gaps` (import `_plain_employees` from `admin_overview`; do not copy the TL-detection filters); `staff` = `is_staff`; `techs` read `UserTech` through `tech_assignments` with `level` possibly NULL → "Ungraded"; `approver_sla` merges overtime/standby/leave decisions with `approved_at` in the last 30 days and `approved_by` set; **avg is weighted across the three models** (`sum(total_seconds)/sum(decisions)`, never a mean of means); leave age uses `Coalesce("submitted_at","created_at")`; `approval_rate_pct` = approved ÷ (approved + rejected); `top_reasons` group by lower-cased trimmed `rejection_reason`, blanks excluded, current calendar month.

- [ ] **Step 1: Failing tests:** forbidden for employee/HR-only; `test_roles_match_users_stats_definition` (same `employees_without_tl` number as `admin_overview`); `test_user_with_two_roles_counted_in_each`; `test_techs_ungraded_bucket_and_level_counts_stay_inside_their_tech` (a level of Tech A never appears under Tech B); `test_approver_avg_is_weighted_across_models` (A: 1 overtime decision in 2h; 3 leave decisions in 6h each ⇒ 5.0 not 4.0); `test_decisions_older_than_30_days_ignored`; `test_rejection_reasons_group_case_insensitively_and_ignore_blank`; `test_empty_org_has_zeroed_roles_and_empty_lists`; `test_query_count_independent_of_row_count`.
- [ ] **Step 2: Run** `py -3.14 manage.py test apps.dashboard.tests.test_admin_people` → FAIL.
- [ ] **Step 3: Implement** `admin_people.py` + action.
- [ ] **Step 4: Run** module → PASS; `py -3.14 manage.py check`; ruff on `apps/dashboard`.
- [ ] **Step 4b: Index check.** `OvertimeLog`, `StandbyLog` and `LeaveRequest` have no index on `approved_at`, which the 30-day decision filter and the rejection-month filter use. Seed ~50k rows per table in a scratch DB, run `QuerySet.explain(analyze=True)` on the approver and rejection queries, and record timings in the PR. Add a migration (`Index(fields=["approved_at"])` per model, generated by `makemigrations`, never hand-edited) **only if** a sequential scan costs more than ~100 ms at that size; otherwise add none. If added, `py -3.14 manage.py makemigrations --check` is clean and the migration tests pass.
- [ ] **Step 5: Commit** `feat(dashboard): admin_people aggregate endpoint`.

### Task 8: People and approval widgets

**Files:**
- Modify: `types/index.ts` (`AdminPeople`), `dashboardService.ts` (`getAdminPeople()`), `useAdminDashboardQueries.ts` (`useAdminPeople(enabled)`, key `["admin","people"]`), `config/dashboardWidgets.ts`, `AdminDashboardWidgets.tsx`
- Create: `dashboard-widgets/{PeopleSection,RoleDistributionWidget,TechDistributionWidget,ApproverSlaWidget,RejectionAnalysisWidget}.tsx` + tests

**Interfaces:** widget ids `role-distribution` and `tech-distribution` (`section: "overview"`), `approver-sla` and `rejection-analysis` (`section: "approvals"`); `PEOPLE_WIDGET_IDS`; same opt-in rule (not in `defaultAdminLayout`).

- [ ] **Step 1: Failing tests** as in Task 6 (skeleton / ErrorCard+retry / EmptyState; endpoint not called when none active). Specific: `RoleDistributionWidget` lists the 7 role counts and highlights `employees_without_tl > 0` with the warning tone; `TechDistributionWidget` renders "Ungraded" last and each level count under its own tech; `ApproverSlaWidget` shows rate and `avg_decision_hours` as `14.2h`, empty state "No decisions in the last 30 days"; `RejectionAnalysisWidget` shows per-type counts and reason list, no reason rows when none.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** and wire `PeopleSection` after `TrendsSection`.
- [ ] **Step 4: Run** targeted vitest, `npx tsc --noEmit`, eslint → PASS.
- [ ] **Step 5: Phase gate:** enable every new widget on one account and confirm in DevTools network that exactly three dashboard requests fire (`admin_overview`, `admin_trends`, `admin_people`), each once; switch all of a section's widgets off and confirm its request disappears.
- [ ] **Step 6: Commit** `feat(admin): role, tech, approver SLA and rejection widgets`. Open PR "Phase 3".

---

## Phase 4 — Command palette

### Task 9: `AdminCommandPalette`

**Files:**
- Create: `frontend/src/components/layout/AdminCommandPalette.tsx`, `AdminCommandPalette.test.tsx`
- Modify: `frontend/src/components/layout/AdminShell.tsx`, `AdminSidebar.tsx` (+ extend `AdminShell.test.tsx`, `AdminSidebar.test.tsx`)

**Interfaces:**
- Consumes: `AdminNavItem` (`components/layout/hooks/useAdminNavItems.ts`) — the list is already filtered by role, CR scope and active plugins, so the palette can never show a link the viewer cannot use; `Dialog`/`DialogContent size="md" padded={false} hideClose`.
- Produces:
  ```tsx
  interface AdminCommandPaletteProps { items: AdminNavItem[]; open: boolean; onOpenChange(open: boolean): void }
  export const AdminCommandPalette: React.FC<AdminCommandPaletteProps>;
  // AdminSidebar gains an optional prop: onOpenPalette?: () => void  (renders a "Search… Ctrl K" button; icon-only when collapsed)
  ```
  Scope is navigation only. Plugin-injected sidebar links (rendered via `PluginSlot`, not in `items`) are intentionally not searchable — recorded in the PR description as a known limit.

- [ ] **Step 1: Failing tests:**
  - `Ctrl+K and Meta+K open the palette and call preventDefault` (AdminShell level); `Escape closes`.
  - `typing filters items by label and group (case-insensitive)`; `no match shows "No matches"`.
  - `ArrowDown/ArrowUp move the active option (aria-activedescendant on the combobox input), wrapping`; `Enter navigates to the active item's path and closes`; `click navigates`.
  - `input has role="combobox", list has role="listbox", options role="option", aria-selected on the active one`; `focus returns to the sidebar trigger button on close`.
  - `CR-only admin: only items passed in are listed` (pass the CR-filtered list; assert nothing else appears).
  - `AdminSidebar renders the trigger only when onOpenPalette is provided` (existing sidebar tests untouched and green).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** (no `cmdk`): controlled query state reset on close; matches memoised from `items`; the global hotkey listener lives in `AdminShell` in a `useEffect` with cleanup; group headings reuse `SidebarSectionLabel` text style.
- [ ] **Step 4: Run** `npx vitest run src/components/layout` and `node scripts/modal-audit.mjs` → PASS / exit 0. Keyboard-only walkthrough + 375px check in CloakBrowser.
- [ ] **Step 5: Commit** `feat(admin): Ctrl+K navigation palette`. Open PR "Phase 4".

---

## Phase 5 — Page conveniences

### Task 10: Shared CSV-safe cell writer and the leave-requests export fix

**Files:**
- Create: `frontend/src/lib/csvSafe.ts`, `frontend/src/lib/csvSafe.test.ts`
- Modify: `frontend/src/lib/export-leave-requests.ts` (+ `export-leave-requests.test.ts` create)

**Interfaces:**
- Produces: `export function csvCell(value: unknown): string` — returns an RFC-4180 cell: text starting with `=`, `+`, `-`, `@`, tab or CR is prefixed with `'`; any cell containing `,`, `"`, CR or LF is wrapped in double quotes with `"` doubled. Numbers pass through unprefixed.
- Consumes: nothing from `plugins/tl_scorecard` (see Global Constraints). Invariant source: `docs/hbpr-and-scorecard.md` ("Search/export must not undo redaction").

- [ ] **Step 1: Failing tests:** `csvCell("=HYPERLINK(\"x\")")` → `"'=HYPERLINK(""x"")"`; `csvCell("+1")`/`"-2"`/`"@a"`/`"\t x"` prefixed; `csvCell("a,b")` → `"a,b"` quoted; `csvCell('say "hi"')` → `"say ""hi"""`; `csvCell("two\nlines")` quoted; `csvCell(3.5)` → `3.5`; `csvCell(null)` → empty. Export test: a request whose `reason` is `=cmd|' /C calc'!A0` produces a row where that cell starts with `'=`, and a reason with a comma keeps the row at exactly 7 columns.
- [ ] **Step 2: Run** → FAIL. 
- [ ] **Step 3: Implement** `csvCell`; change `exportLeaveRequestsToCSV` to map every value (headers excluded) through it, replacing `(r.reason || "").replace(/,/g, ";")`.
- [ ] **Step 4: Run** `npx vitest run src/lib` → PASS.
- [ ] **Step 5: Commit** `fix(admin): neutralise formulas and quoting in the leave-requests CSV`.

### Task 11: Admin Overtime/Standby CSV export button

**Files:**
- Modify: `frontend/src/pages/admin/components/HoursLogsPage.tsx` (add optional `onExport?: () => void | Promise<void>` rendered as an outline `Download` button in the header actions only when provided), `frontend/src/pages/admin/OvertimeLogsPage.tsx`, `StandbyLogsPage.tsx`
- Test: `HoursLogsPage.test.tsx` (create/extend), page tests

**Interfaces:**
- Consumes: `overtimeService.exportCsv(params)` (`services/overtimeService.ts:79`), and its standby counterpart in `services/standbyService.ts` — **Step 1 confirms the standby method exists with the same shape; if it does not, the standby button is dropped from this task rather than a new endpoint added.**
- Passes the page's current `status`, `date_from`, `date_to` filters; omits `ignore_date_filter` unless the page already sets it.

- [ ] **Step 1: Verify** `git grep -n "exportCsv" frontend/src/services` and read the backend export view's CSV writer (`apps/overtime/views` / `viewsets.py` `export`): confirm it neutralises leading `= + - @` in free-text columns (`description`, `evidence`, `rejection_reason`). If it does not, add the neutraliser server-side with a failing test first (`apps/overtime/tests.py`, same for standby) — an export button must not ship over an injectable writer.
- [ ] **Step 2: Failing tests:** `HoursLogsPage shows Export CSV only when onExport is passed`; `clicking it calls onExport once and disables while pending`; `Overtime page passes current filters to exportCsv` (spy); failure shows an error toast and re-enables the button.
- [ ] **Step 3: Run** → FAIL.
- [ ] **Step 4: Implement** and wire both pages.
- [ ] **Step 5: Run** `npx vitest run src/pages/admin` (+ `py -3.14 manage.py test apps.overtime apps.standby` if Step 1 touched the backend) → PASS.
- [ ] **Step 6: Commit** `feat(admin): export filtered overtime and standby logs to CSV`.

### Task 12: Leave balances "Expiring soon" quick filter

**Files:**
- Modify: `frontend/src/pages/admin/LeaveBalancesPage.tsx`
- Create: `frontend/src/pages/admin/hooks/leaveBalanceFilters.ts` (+ `.test.ts`)
- Test: extend `LeaveBalancesPage.test.tsx`

**Interfaces:**
- Produces: `export const isExpiringSoon = (b: LeaveBalance, today: Date, windowDays = 60): boolean` — true when `is_carry_over === true`, `expires_at` is non-empty and within `[today, today + windowDays]` inclusive, and `available_days > 0`. Window matches the backend's `CARRYOVER_WARNING_DAYS = 60` (`apps/dashboard/admin_overview.py`), so the dashboard card and this filter agree.

- [ ] **Step 1: Failing tests:** `isExpiringSoon`: expires in 60 days ✓, in 61 ✗, yesterday ✗, `expires_at` null ✗, not carry-over ✗, `available_days` 0 ✗, boundary days inclusive. Page: `toggle "Expiring ≤ 60 days" filters the table to matching rows and shows the count`; `toggle off restores all rows`; `toggle state is reflected in the URL (?expiring=1)` so the dashboard carry-over card can deep-link; `aria-pressed` reflects state.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the helper, a `Button variant="outline"` toggle (`aria-pressed`) above the `DataTable`, and filter `balances` before passing `data`. Point the Task 2 `carryover-risk` insight `to` at `/admin/leave-balances?expiring=1` (update that rule's test).
- [ ] **Step 4: Run** `npx vitest run src/pages/admin src/lib` → PASS.
- [ ] **Step 5: Commit** `feat(admin): expiring-carryover filter on leave balances`.

---

## Phase 6 — Close-out

### Task 13: Docs, full verification, handoff

**Files:**
- Modify: `AGENTS.md` (session entry), `.devin/context/03-FRONTEND-PATTERNS.md` (admin dashboard: sections, opt-in widget rule, no DnD), `.devin/context/04-API-PATTERNS.md` (the two endpoints), `CLAUDE.md` Hot Invariants (one line: new admin dashboard endpoints are staff-only aggregates; new widgets are opt-in and never in `defaultAdminLayout`).

- [ ] **Step 1: Run the full pass once:**
  `py -3.14 manage.py makemigrations --check; py -3.14 manage.py test; python -m ruff check --output-format=concise apps/dashboard apps/overtime apps/standby`
  `cd frontend; npx tsc --noEmit; npx vitest run; npx eslint src --quiet; node scripts/modal-audit.mjs; node scripts/table-header-audit.mjs; npm run build`
  Expected: all exit 0 (the known pre-existing `AnimatedNumber` test failure is reported, not hidden, if it still fails).
- [ ] **Step 1b: E2E.** Create `frontend/e2e/admin-dashboard.spec.ts` (admin storage state per the E2E runbook in memory `reference_e2e_runbook`): `Ctrl+K opens the palette, typing "leave" then Enter lands on /admin/leave-requests`; `a dismissed insight stays dismissed after reload`; `/admin?section=approvals shows only approval widgets`; `an employee session gets 403 from /api/dashboard/widgets/admin_trends/`. Run it with the existing admin-touching specs: `npx playwright test e2e/admin-dashboard.spec.ts e2e/role-workflows.spec.ts e2e/visual-guards.spec.ts e2e/preferences.spec.ts` → pass (pre-existing failures in the runbook are reported, not hidden).
- [ ] **Step 2: Visual `verify` against the Task 1 baselines** for admin routes; the only expected diffs are `/admin` (insights, tabs, new widgets when enabled) and the three pages in Phase 5.
- [ ] **Step 3: Success-criteria check** (state each with evidence in the PR): (a) no mockup file or dependency imported — `git diff main --stat -- frontend/package.json` empty; (b) `grep -rnE "#[0-9a-fA-F]{6}|slate-|zinc-|gray-" <new files>` empty; (c) new endpoints 403 for non-staff (test names above); (d) saved-layout robustness tests green; (e) request count check from Task 8 Step 5.
- [ ] **Step 4: Commit** `docs: admin dashboard sections, widgets and endpoints`.

---

## Self-Review

**Spec coverage.** Mockup→site compatibility: Disposition table + Global Constraints (token translation). Cool functions: insights (T2), sections (T3), grouped customise (T4), trends/who's-out (T5–6), people/SLA/rejections (T7–8), palette (T9), CSV/expiring filter (T10–12). Remove bloat: table rows marked Skip, T1/T4/T10 for real-repo bloat. Don't break anything: opt-in widgets never in `defaultAdminLayout`, Review Focus 3, baselines T1 + verify T13, plugin-removal and permission constraints. Optimisation: query-count-independence tests (T5, T7), request-gating (T6, T8), chunk check (T6), removal of a dead DnD tree (T4). Unfinished last-menu pages: explicitly skipped.

**Step scan.** Every code step carries a signature or a named test with assertions; the two verify-first steps (T11 Step 1) state what happens on each outcome.

**Type consistency.** `AdminInsight`/`deriveAdminInsights`/`useDismissedInsights` (T2) used only in T2 and T12's one-line `to` change; `AdminDashboardSection`/`widgetSection` (T3) consumed by T4; widget-id arrays `TRENDS_WIDGET_IDS` (T6) and `PEOPLE_WIDGET_IDS` (T8) follow `OVERVIEW_WIDGET_IDS`; response shapes in T5/T7 are the single source for `AdminTrends`/`AdminPeople` in T6/T8.

**Second-pass gaps closed:** restored sections, per-user insight dismissal, stale-after-action (Task 4A), DnD test-mock update, lazy chunks, `approved_at` index evidence, e2e coverage; SW network-only and logout cache-clear recorded as already fine.

**Proportion.** Plan is long because it covers ~7 mockup-derived features across two layers plus a disposition audit; code bodies are absent except contracts.

## Further ideas (not in this plan, ranked by value over cost)

1. **Insight deep links with filters**, e.g. insight → `/admin/leave-requests?status=pending&older_than=15`; each target page must read URL filters first (only Task 12's `?expiring=1` is built here).
2. **Palette v2**: server-backed user search (reuse the Users list `search` param) and recent pages; fold `HeaderSearch` into the same component so the main app gets the palette too.
3. **Dashboard presets** ("Approver view", "Payroll close view"): named widget-id sets a superuser can apply; small once layouts are stable.
4. **Server-side TTL cache** for `admin_trends`/`admin_people` (pattern: `CacheKey.dashboard_reference`), only if Phase 2/3 evidence shows a hot path; tests must `cache.clear()` in `setUp()`.
5. **Insights digest**: weekly in-app notification summarising critical/warning insights; needs a scheduler this repo lacks, so it would run lazily like `purge_hbpr_archive`.
6. **Dashboard PDF export**: reuse `pdfExport.ts` via dynamic import inside the click handler (heavy-lib invariant).
7. **Trend period parameter**: validated `?months=3..24` on `admin_trends`, then a selector that actually changes data.

## Decisions I made that you may want to overrule

1. **Visual identity:** keep Obsidian Enterprise (purple/Plus Jakarta); the mockup's blue/Inter look is not adopted.
2. **Drag-and-drop reorder:** removed rather than implemented (it never worked; reordering is a separate feature if you want it).
3. **No period selector** and no table↔cards switcher in this plan (no backend support / separate spec).
4. **Deferred widgets** (payroll run, audit trend, plugin inventory, skills, scorecard, ticket KPI, notification health, storage) need their own per-plugin spec.
