# Team Overview Speed, App-wide Table Fit, Concise Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Team Overview page as fast as the other pages, remove its leave "Overlap" column, stop horizontal scrolling on tables app-wide by fitting columns to the container, and make both sidebars shorter.

**Architecture:** Backend: remove per-row queries from the leave and standby `team_logs` actions. Frontend: cache team queries, memoize the grouped month sections and stop the exit animation from holding heavy tables mounted. Tables: `DataTable` gets column priorities and hides the lowest-priority columns that do not fit its measured width (user choice in the Columns menu wins and persists). Sidebar: denser rows, collapsible persisted sections, and one compact profile row in the footer.

**Tech Stack:** Django 6 + DRF, React 19, @tanstack/react-table v9, @tanstack/react-query, Tailwind, framer-motion, vitest.

**Spec:** Owner request 2026-11-27 (this conversation) + reference mockup graph `C:\Users\EDEMNUSHIW\Desktop\Engineering_tracker\team-overview-design\graphify-out\` (mockup sources are deleted; its graph records a bordered table container, a `Columns (6/7)` menu with `DEFAULT_VISIBLE_COLUMNS`, flat rows for single-record groups, collapsible months). Owner rulings: remove **Overlap** (not Balance Left); tables use **auto-hide by priority**.

**Branch:** `perf/team-overview-tables-sidebar` (off `origin/main` 14d335a5).

## Global Constraints

- No new npm or pip packages. `ResizeObserver` is native.
- Table header classes come only from `components/ui/tableStyles.ts`; gate `cd frontend && node scripts/table-header-audit.mjs` exit 0.
- Controls/surfaces/modals gates stay green: `node scripts/control-audit.mjs --strict --exclude=src/plugins/engagement`, `node scripts/surface-audit.mjs --strict --exclude=src/plugins/engagement`, `node scripts/modal-audit.mjs`.
- Every new `motion.*` usage goes through `useMotionTransition()` or `useReducedMotion()`; keep `LAYOUT_ID.sidebarActive`.
- React Query keys unchanged (`["team","overtime","logs","all"]` etc.); mutations keep invalidating `["dashboard"]`.
- `MobileBottomNav` keeps reading the flat `visibleItems` list; `NavItem.path`/`label` unchanged (item 61(b)).
- Plugin removal safety: no static import of a plugin module from core; sidebar grouping uses `section` metadata in `plugin.py` only; keep exactly the slots `sidebar-nav`, `admin-sidebar-nav`, `admin-sidebar-nav-system`.
- Team confidentiality and owner rule untouched: no change to `_filter_team_leader_queryset` / `_filter_owned_by_leader` scoping.
- Django commands use `py -3.14`.
- UI change is not done until clicked in the browser (Frontend gate, `docs/workflow-invariants.md`).

## Model routing (token budget)

| Task | Implementer | Why |
|---|---|---|
| 1, 2, 3 | haiku | Small, test-pinned |
| 4, 5, 7, 8, 9 | sonnet | Multi-file UI, mechanical with judgement |
| 6 | opus | Shared primitive used by ~30 tables; layout algorithm |
| 10 | opus reviewer + `ux-ui-agent-skills:design-critic` | Final whole-branch review |

## Review Focus

1. A table whose priority-1 columns alone exceed the container must still scroll horizontally (never clip a column). Test in Task 6.
2. A column the user hid or showed in the Columns menu stays that way after a resize or reload; "Reset to default" returns to auto. Test in Task 6.
3. Rows selected inside a month section that the leader then collapses must leave the selection, so a bulk approve/delete never reaches hidden rows. Test in Task 4.
4. A leave request whose user has no current-year balance still returns `user_leave_balance: 0` with no extra query. Test in Task 1.
5. The active route sits inside a sidebar section the user had collapsed: the section opens. Test in Task 8.

---

### Task 1: Leave `team_logs` without per-row queries

**Files:**
- Modify: `apps/leave_management/viewsets.py:491-504` (extract prefetch), `:516` (`team_logs` queryset)
- Test: `apps/leave_management/test_team_logs_queries.py` (create)

**Interfaces:**
- Produces: `LeaveRequestViewSet._current_balances_prefetch(self) -> Prefetch` returning the existing `Prefetch('user__leave_balances', ..., to_attr='prefetched_leave_balances')`, used by both `get_queryset` and `team_logs`.

- [ ] **Step 1: Write the failing test** `TeamLogsQueryCountTests.test_query_count_does_not_grow_with_rows`: a Line Manager with 2 linked members; create 2 leave requests, record `len(CaptureQueriesContext)` for `GET /api/leave/requests/team_logs/` (check the real URL name with `py -3.14 manage.py show_urls | grep team_logs` or the router); add 6 more requests (one member with no `LeaveBalance` row); assert the second count equals the first; assert the no-balance row has `user_leave_balance == 0`. Call `cache.clear()` in `setUp`.
- [ ] **Step 2: Run** `py -3.14 manage.py test apps.leave_management.test_team_logs_queries` — Expected: FAIL (count grows).
- [ ] **Step 3: Implement** `_current_balances_prefetch`, use it in `get_queryset`, and in `team_logs` add `'balance'` to `select_related` and `.prefetch_related(self._current_balances_prefetch())`. If `get_effective_available_days` still queries per row, prefetch what it reads in the same `Prefetch` queryset rather than changing the method.
- [ ] **Step 4: Run** the test and `py -3.14 manage.py test apps.leave_management` — Expected: PASS.
- [ ] **Step 5: Commit** `perf(leave): team_logs loads balances in one query`.

### Task 2: Standby `team_logs` without per-row queries

**Files:**
- Modify: `apps/standby/viewsets.py:582`, `apps/standby/serializers.py:88-89`
- Test: `apps/standby/test_team_logs_queries.py` (create)

- [ ] **Step 1: Write the failing test** `StandbyTeamLogsQueryCountTests.test_query_count_does_not_grow_with_rows`: same shape as Task 1 with standby logs carrying 1-2 `clients`; assert equal counts for 2 vs 8 rows and `client_names` equals the clients' names.
- [ ] **Step 2: Run** `py -3.14 manage.py test apps.standby.test_team_logs_queries` — Expected: FAIL.
- [ ] **Step 3: Implement** `prefetch_related('clients')` in `team_logs`; `get_client_names` returns `[c.name for c in obj.clients.all()]` (reads the prefetch cache).
- [ ] **Step 4: Run** the test and `py -3.14 manage.py test apps.standby` — Expected: PASS.
- [ ] **Step 5: Commit** `perf(standby): team_logs prefetches clients`.

### Task 3: Team queries cache instead of refetching every visit

**Files:**
- Modify: `frontend/src/hooks/useTeamManagement.ts:10` (`TEAM_PAGE_SIZE`), `:45-86` (five queries)
- Test: `frontend/src/hooks/useTeamManagement.test.tsx`

All three categories stay loaded: the page shows pending counts for every tab (`TeamManagementPage.tsx:205-207`), so do not add `enabled` per tab.

- [ ] **Step 1: Write the failing tests** `fetches with page_size 5000` (fetcher spy called with `page_size: 5000`) and `does not refetch on remount within 30 seconds` (mount, unmount, remount with the same `QueryClient`; the API mock is called once per query).
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/hooks/useTeamManagement.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** `TEAM_PAGE_SIZE = 5000`, `TEAM_STALE_MS = 30_000` as `staleTime` on all five queries, remove `refetchOnMount: true` and `staleTime: 0`. Keep `MAX_TEAM_PAGES` and the invalidations.
- [ ] **Step 4: Run** the test file — Expected: PASS.
- [ ] **Step 5: Commit** `perf(team): cache team queries for 30s, fewer pages`.

### Task 4: Month sections render once, collapse without jank

**Files:**
- Modify: `frontend/src/pages/team/components/TeamGroupedTables.tsx` (`:88` collapsed state, `:169` `buildSections`, `:206-227` animation)
- Test: `frontend/src/pages/team/components/TeamGroupedTables.test.tsx`

**Interfaces:**
- Produces: new optional prop `onSectionCollapse?: (rowIds: string[]) => void` on `TeamGroupedTables`, called with the `getRowId` ids of a section's rows when it collapses. Consumed by Task 5.
- Produces: memoized inner component `MonthSection` (same file) with props `{ section, collapsed, onToggle, ...table props }`.

- [ ] **Step 1: Write the failing tests**:
  - `only the newest month is expanded on first render` (3 months of rows; table rows of the 2 older months are absent from the DOM).
  - `collapsing a section reports its row ids` (`onSectionCollapse` called with that section's ids only).
  - `toggling one section does not re-render the others` (render-count spy on `DataTable` mock: toggling month B re-renders only month B).
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/pages/team/components/TeamGroupedTables.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement**: `useMemo(() => buildSections(rows), [rows, buildSections])`; initial collapsed state = every section key except the first (newest); `MonthSection` wrapped in `React.memo` with a `useCallback` toggle; the body mounts only while expanded with an opacity enter (no `AnimatePresence` exit), through `useMotionTransition`.
- [ ] **Step 4: Run** the test file — Expected: PASS.
- [ ] **Step 5: Commit** `perf(team): memoized month sections, newest open, no exit animation`.

### Task 5: Team page callbacks stable, Overlap column removed

**Files:**
- Modify: `frontend/src/pages/team/TeamManagementPage.tsx:88` (visibility defaults), `:265` (`handleReject`), `:401-432` (grouped table callbacks), pass `onSectionCollapse`
- Modify: `frontend/src/pages/team/hooks/useTeamColumns.tsx:290-320` (delete the `overlap` column)
- Test: `frontend/src/pages/team/hooks/useTeamColumns.test.tsx`, `frontend/src/pages/team/TeamManagementPage.test.tsx`

**Interfaces:**
- Consumes: `onSectionCollapse(rowIds)` from Task 4.

- [ ] **Step 1: Write the failing tests**: `leave columns have no Overlap column in any grouping mode` (column ids exclude `overlap`, no header text "Overlap"); page test `collapsing a month removes its rows from the selection` (select a row, collapse its month, bulk bar count drops to 0).
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/pages/team` — Expected: FAIL.
- [ ] **Step 3: Implement**: delete the column and `"overlap"` from the `:88` list; keep `cluster_*` data and the detail panel "Same-window absences" list; wrap `handleReject` and the grouped callbacks in `useCallback`; `onSectionCollapse` drops those ids from `rowSelection`. Remove any `cluster_size` rendering left orphaned only if nothing else reads it (`find_usages`).
- [ ] **Step 4: Run** `npx vitest run src/pages/team` and `npx eslint src/pages/team` — Expected: PASS, 0 errors.
- [ ] **Step 5: Commit** `feat(team): remove leave Overlap column; stable callbacks`.

### Task 6: DataTable fits its container (opus)

**Files:**
- Create: `frontend/src/components/ui/columnFit.ts`, `frontend/src/components/ui/useContainerWidth.ts`
- Modify: `frontend/src/components/ui/tableTypes.ts:68-76` (`ColumnMeta`), `frontend/src/components/ui/DataTable.tsx` (`:318-326`, `:442-443`, `:470-478`, visibility state), `frontend/src/components/ui/ColumnVisibilityMenu.tsx`, `frontend/src/components/ui/tableStyles.ts` (body/head cell padding)
- Test: `frontend/src/components/ui/columnFit.test.ts` (create), `frontend/src/components/ui/DataTable.test.tsx` (existing parity tests must stay green)

**Interfaces:**
- Produces in `ColumnMeta`: `priority?: 1 | 2 | 3` (undefined = 1, never auto-hidden; 3 hides first), `truncate?: boolean`.
- Produces: `computeAutoVisibility(columns: { id: string; size: number; priority: 1 | 2 | 3 }[], availableWidth: number): ColumnVisibilityState` — hides priority 3 columns right-to-left, then priority 2, until the sum of `size` fits; never hides priority 1.
- Produces: `useContainerWidth(ref: RefObject<HTMLElement>): number | null` (ResizeObserver, `null` before first measure).
- Produces: effective visibility = `{ ...auto, ...userOverride }`; user override is what `storageKey` already persists; `ColumnVisibilityMenu` trigger label `Columns (n/m)` and a `Reset to default` item that clears the override.

- [ ] **Step 1: Write the failing tests** in `columnFit.test.ts`: `hides priority 3 before priority 2`, `hides rightmost first within a priority`, `never hides priority 1 even when it cannot fit`, `returns all visible when width fits`. In `DataTable.test.tsx`: `table has no min-w-max and uses table-fixed with a min width equal to visible column sizes`, `user override beats auto visibility after resize` (mock ResizeObserver width), `reset to default restores auto`, `menu shows Columns (n/m)`, `truncate cell renders title with the full text`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/components/ui` — Expected: new tests FAIL.
- [ ] **Step 3: Implement**: table class `w-full table-fixed` with inline `minWidth` = sum of visible `getSize()` (scroll stays the fallback, Review Focus 1); `<colgroup>` from `getSize()` (`meta.flex` column gets no width so it absorbs the rest); `truncate` cells get `max-w-0 truncate` and `title`; auto-visibility only runs when any column has `meta.priority`, and turns the Columns menu on for those tables; body/head padding `px-3 xl:px-4` in `tableStyles.ts` (head keeps `whitespace-nowrap`); selection checkbox cell keeps `TABLE_HEAD_CELL_CHECKBOX_CLASS`.
- [ ] **Step 4: Run** `npx vitest run src/components/ui`, `node --test scripts/table-header-audit.test.mjs`, `node scripts/table-header-audit.mjs`, `npx tsc --noEmit` — Expected: all PASS / exit 0.
- [ ] **Step 5: Commit** `feat(ui): DataTable fits container via column priority`.

### Task 7: Annotate the widest tables

**Files (column hooks, add `meta.priority`/`meta.truncate` and `size` where missing):**
- `frontend/src/pages/team/hooks/useTeamColumns.tsx`, `pages/team/hooks/useTLApprovalColumns.tsx`, `pages/overtime/hooks/useOvertimeColumns.tsx`, `pages/standby/hooks/useStandbyColumns.tsx`, `pages/admin/hooks/useUserColumns.tsx`, `pages/admin/hooks/useHbprAssignmentColumns.tsx`, `pages/admin/hooks/useLeaveBalanceColumns.tsx`, `pages/admin/components/LeaveRequestsTable.tsx`, `pages/admin/components/HoursLogsTable.tsx`
- Test: each hook's existing `*.test.tsx`; add one assertion per hook in `frontend/src/components/ui/columnPriorityRules.test.ts` (create) that walks the hooks' column defs.

**Rule (one rule for every table):** priority 1 = person/name, date, status, hours/days, actions, select; priority 2 = type, client, team; priority 3 = description/reason (also `truncate`), ticket references, payroll period, blocks, code, email, timestamps, carry-over/expiry flags, Manager/Line Manager assignment columns. Existing `defaultColumnVisibility` entries are removed where priority replaces them.

- [ ] **Step 1: Write the failing test** `every annotated table marks actions, select and status priority 1 and description priority 3 + truncate`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/components/ui/columnPriorityRules.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the annotations per the rule.
- [ ] **Step 4: Run** `npx vitest run src/pages src/components/ui` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(tables): column priorities on the widest tables`.

### Task 8: Sidebar denser, sections collapsible

**Files:**
- Create: `frontend/src/components/layout/SidebarSection.tsx`, `frontend/src/hooks/useSidebarGroups.ts`
- Modify: `frontend/src/components/layout/SidebarNavLink.tsx:51`, `SidebarNavGroup.tsx` (row height, icon `h-4 w-4`), `SidebarNav.tsx:58-80` (use `SidebarSection`), `AdminSidebar.tsx` (groups through `SidebarSection`, `space-y-0.5`), `SidebarSectionLabel.tsx` (delete if unused)
- Modify: `plugins/analytics/plugin.py`, `plugins/organigrama/plugin.py` (give their `sidebar-nav` slot a `section`, so the "Plugins" bucket is empty)
- Test: `SidebarNav.test.tsx`, `AdminSidebar.test.tsx`, `SidebarNavLink.test.tsx`, new `frontend/src/hooks/useSidebarGroups.test.ts`, `apps/plugins/test_registry_consistency.py`

**Interfaces:**
- Produces: `useSidebarGroups(scope: "app" | "admin", activeSection: string | null): { isOpen(id: string): boolean; toggle(id: string): void }` persisted in `localStorage` key `sidebar_groups:<scope>:<userId>`; the active section is always open.
- Produces: `<SidebarSection id label open onToggle collapsed>` — `h-7` header button with chevron and `aria-expanded`; in collapsed rail mode it renders a thin divider and children always show (tooltips stay).

- [ ] **Step 1: Write the failing tests**: `opens the section holding the active route even when stored closed` (Review Focus 5), `remembers a closed section across remounts`, `section header toggles aria-expanded`, `nav link row is h-8 (pointer-coarse:h-10)`, `no Plugins bucket when every plugin item has a section`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/components/layout src/hooks/useSidebarGroups.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**: link `h-8 px-2.5 gap-2.5 text-sm pointer-coarse:h-10`; group parent same height and icon size; sections via `SidebarSection` + `useSidebarGroups`; Settings stays pinned last; active bar `layoutId` unchanged; plugin `section` values chosen from `NAV_SECTION_ORDER` (analytics → leadership-or-core per its roles; organigrama → core).
- [ ] **Step 4: Run** the tests plus `py -3.14 manage.py test apps.plugins.test_registry_consistency` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(sidebar): denser rows and collapsible persisted sections`.

### Task 9: Compact sidebar header and footer

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx:73-137`, `AdminSidebar.tsx:150-222`
- Create: `frontend/src/components/layout/SidebarProfileMenu.tsx` (reuse `HeaderProfileMenu.tsx` building blocks and the existing `DropdownMenu` primitive)
- Test: `Sidebar.test.tsx`, `AdminSidebar.test.tsx`, `SidebarUserProfile.test.tsx`, `SidebarInstallButton.test.tsx`

**Interfaces:**
- Produces: `<SidebarProfileMenu collapsed />`: one `h-10` row (avatar + name, no email) opening a menu with Theme, Install app (only when `InstallButton` would show), Settings, Log out. Log out keeps the existing offline-queue confirmation path.

- [ ] **Step 1: Write the failing tests**: `footer is a single profile row`, `profile menu holds theme, settings and log out`, `log out from the menu runs the same logout handler`, `install item hidden when install is unavailable`, `header has no email line`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/components/layout` — Expected: FAIL.
- [ ] **Step 3: Implement**: header `px-3 py-2`; admin search becomes an icon button beside the brand; footer replaced by `SidebarProfileMenu` in both sidebars; mobile drawer `id="app-mobile-sidebar"` and aria ids unchanged.
- [ ] **Step 4: Run** `npx vitest run src/components/layout`, `node scripts/control-audit.mjs --strict --exclude=src/plugins/engagement`, `node scripts/surface-audit.mjs --strict --exclude=src/plugins/engagement` — Expected: PASS / exit 0.
- [ ] **Step 5: Commit** `feat(sidebar): compact header and single profile footer`.

### Task 10: Full verification, browser pass, review

- [ ] **Step 1: Full backend**: `py -3.14 manage.py makemigrations --check; py -3.14 manage.py test` — Expected: no migrations, 0 failures. `python -m ruff check --output-format=concise` on changed `.py` files — 0 issues.
- [ ] **Step 2: Full frontend**: `cd frontend; npx tsc --noEmit; npx vitest run; npm run build; node scripts/modal-audit.mjs; node scripts/table-header-audit.mjs` — Expected: all pass.
- [ ] **Step 3: Browser pass on dummy data** (Local review stack recipe, `docs/workflow-invariants.md` §Frontend gate), 1366px and 1536px, light and dark, as a Line Manager and as an admin:
  - Team Overview: network tab shows each team list loaded once, revisit within 30s fires no team request; expand/collapse months is smooth; select rows, collapse, bulk bar shows 0; approve, reject, delete, export still work; no Overlap column.
  - Tables: Overtime, Standby, Team approvals, Admin Users, Leave Balances, HBPR assignments, Leave Requests fit with no horizontal scroll at 1366px; Columns (n/m) menu toggles and Reset work; truncated description shows full text on hover.
  - Sidebar: Line Manager sidebar fits without scrolling at 768px height; sections collapse and remember; active route section opens; collapsed rail tooltips; profile menu logout; mobile 393px drawer and bottom nav unchanged.
  - Zero console errors, all requests 2xx.
- [ ] **Step 4: Review**: dispatch a fresh opus whole-branch reviewer (`superpowers:requesting-code-review`) and `ux-ui-agent-skills:design-critic` on the rendered pages; fix findings, rerun Steps 1-2.
- [ ] **Step 5: Docs + commit**: add the column-priority rule to `docs/table-header-contract.md` and a Hot Invariant line in `CLAUDE.md` ("tables fit by `meta.priority`; never `min-w-max`"); `graphify update .`; commit `docs: table fit and sidebar rules`.
