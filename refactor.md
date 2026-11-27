# Team Overview & Cross-App UI Refactor Plan (`refactor.md`)

> **Branch:** `feat/team-overview-ui-refactor` (fast-forwarded to `origin/main` `9517db3f`)  
> **Route:** `/team` (`TeamManagementPage.tsx`)  
> **Reference Mockup:** `C:\Users\EDEMNUSHIW\Desktop\Engineering_tracker\team-overview-design` (`DESIGN.md` + `graphify-out/graph.json`, 326 nodes / 845 edges)  
> **Production Graph:** `graphify-out/graph.json` (26,642 nodes / 73,127 edges, updated incrementally)  
> **Status:** Ready for phased implementation. Owner rulings locked; cross-stack & UI/UX specs verified via Opus 5.5 + `$graphify query`.

---

## 1. Confirmed Owner Rulings (Locked)

1. **Undo toast (`status: 'pending'`):** **Dropped.** Approve/reject remains one-way, matching `BulkActionMixin` (`pending` → `approved` / `rejected` only).
2. **Payroll reassignment (`Same month` / `Next month` / `Comp time`):** **Read-only.** Server-decided by month cutoff (`resolve_processing_assignment`); no `Comp time` or client-side period write.
3. **`+ Log request` for team members:** **Omitted from `/team` header** (or routed to leader's own create dialogs only; `resolve_target_user` remains staff/superuser-only for on-behalf creation).
4. **New npm dependency (`@radix-ui/react-dropdown-menu`):** **Approved.** Add to `frontend/package.json` and build `frontend/src/components/ui/dropdown-menu.tsx` (tokenized) for cross-app menu upgrades.

---

## 2. Hard Invariants & Guardrails

- **Role Naming (`docs/workflow-invariants.md` item 52):** User-visible text must always say **Manager** (`italian_tl`) and **Line Manager** (`albanian_tl`), never "Italian TL" / "Albanian TL". Mockup's "By Manager" maps to `memberGroupMode = "italian_tl"` (`italian_tl_name`).
- **Table Contract (`docs/table-header-contract.md`):** Header typography/fill come from `frontend/src/components/ui/tableStyles.ts` (`TABLE_HEAD_CELL_CHECKBOX_CLASS`, `TABLE_ROW_HOVER_CLASS`, `TABLE_BODY_DIVIDER_CLASS`). Approval columns keep `meta: { actionsDisplay: "column" }` (`tableColumnHelpers.tsx:75,126`). **Do NOT make Actions sticky `right-0`** (`CLAUDE.md` admin visual-lift rule: plain right-aligned column).
- **Two-Surface & Control Kit Gates (`docs/ui-control-kit.md`):** No third nested grey pill track; no `h-8`..`h-12` ad-hoc heights; no raw `<input>`; no `text-[11px]`/`text-[10px]` micro-text (use `text-xs`).
- **Tokens Only (No `dark:` overrides):** Map all mockup `slate`/`emerald`/`amber`/`red`/`blue` classes to semantic tokens and `components/ui/tone.ts` (`toneTextClass`, `toneSurfaceClass`, `toneFillClass`).
- **Motion (`lib/motion.ts`):** Use `framer-motion` + `lib/motion.ts` (`DURATION.fast`, `EASE.standard`, `useMotionTransition`), **never** `motion/react`. Any `layoutId` must have its own `LAYOUT_ID` entry.
- **Business Calendar & Cutoff:** Current month from `currentBusinessMonthKey()` (`Europe/Tirane`). Server enforces OT/standby month cutoff and `ClosedYear` locks (surface partial failures from `failed_ids`).
- **CSV Safety:** Client CSV exports must use `csvCell` (`lib/csvSafe.ts`).

---

## 3. Pre-Port Bug Fixes (Phase 1 — Test-First)

1. **Dead row-selection wiring on `/team`:** `selectedItems` in `TeamManagementPage.tsx` is only ever reset to empty, no checkbox column exists, and `TeamGroupedTables` receives no `enableRowSelection`/`rowSelection` — `TeamBulkOperationsPanel` can never appear. Fix by wiring `DataTable` `enableRowSelection` + `rowSelection` keyed by record id (`getRowId` returns `row.id`), expanding grouped rows via `selectedRecordIds`, and clearing selection on any filter/tab change.
2. **Hard-coded bulk reject reason:** `useTeamBulkActions.confirmBulkAction` hard-codes `reason: "Rejected by team leader"`. Replace with a real reason dialog (`ConfirmDialog` + labelled `Input` + quick policy reason chips) wired into both single and bulk reject paths.
3. **500-row silent truncation:** `useTeamManagement` fetches `page_size: 500` and reads only `.results`. Fix pagination/cap so grouped days/streaks are never split at row 500.
4. **Position-dependent standby collapse bug:** `collapseSameDayStandbyLogs` and `computeDayGroups` (`frontend/src/lib/standbyDayGroups.ts`) only merge rows of the same person and date when adjacent in the array. Interleaved rows (`A, B, A` on the same date) fail to merge. Refactor to **bucket by key**, not by position.

---

## 4. `team_only=true` Export Contract (Preserve Exactly — Commit `9517db3f`)

- **Frontend (`TeamExportDialog.tsx`):**
  - OT & Standby call `reportService.exportOTStandby({ start_date?, end_date?, team_only: true, status: "approved"|"pending", date_mode: "work_date"|"processing_period" })`.
  - Leave calls `reportService.exportLeave({ start_date?, end_date?, team_only: true })`.
  - No team or Line Manager picker; filename `team_{leave | ot_standby[_pending][_payroll_period]}_export_{date}.xlsx`.
- **Backend (`apps/reports/viewsets.py:697,846` & `apps/reports/filters.py:20`):**
  - Reads `team_only = query_params.get("team_only") == "true"` (exact string `"true"`).
  - `apply_visibility_constraints` ignores HR grant when `team_only=True`: leader OT/standby gets `Q(user_id=self) | owned_by_leader_q(self)` (item 82); leader leave gets `get_team_member_ids() ∪ {self}`.
  - Leave export is **approved only**; OT/standby allows `approved` or `pending` only.
- **Refactor Rules:**
  1. Keep `TeamExportDialog` (single export path; no `DropdownMenu` needed here).
  2. Dialog may be **prefilled** from on-screen date range, team (`team_ids`), and status (`approved`/`pending`).
  3. **Never** offer "Export filtered view" (search / `rejected` / `all` have no server equivalent; item 54).
  4. Every call must send `team_only: true`.

---

## 5. Team Overview Porting Spec

### Architecture Decision: Summary Rows inside `DataTable`
Keep `DataTable` and render **summary rows** (matching the existing standby day-bundle pattern) rather than hand-built `div` grids with expandable child rows.
- Each summary row uses the first record's `id` as its key (`getRowId`) and carries `segment_ids` (overtime block ids, or all shift ids across every day of a standby rotation).
- `selectedRecordIds`, bulk actions, `mobileCard`, and `RowActions` work unchanged. Item 61 requires `mobileCard` to reuse `DataTable` cells.
- `RecordDetailModal` (`layout="panel"`) replaces inline row expansion for inspecting individual blocks/days/overlapping leaves.

### Pure Grouping Helpers (`frontend/src/lib/`)

| View | Helper & Function | Grouping Key & Row Shape | Domain Rules |
|---|---|---|---|
| Overtime **By Day** (`range`) | **New:** `lib/overtimeDayGroups.ts` (`collapseSameDayOvertimeLogs`) | Bucket by `user + date + requested_processing_period`. `{ ...first, hours: Σ paid share, status, blocks[], segment_ids[] }` | **Never** merge across payroll periods (item 23). `hours` is the paid share (`0h` covered entry adds `0`); use `format_hours`, never `int()`. Standalone 1-block days render flat. |
| Standby **By Rotation** (`range`) | **Extend:** `lib/standbyDayGroups.ts` (`collapseSameDayStandbyLogs` fixed by key + `buildStandbyRotations(collapsedDays)` + generalized `pendingIdsOf`) | Consecutive collapsed days of one person, broken by gap `> 1` day or change of `requested_processing_period`. `{ ...first, date_end, day_count, hours: Σ, breakdown: "5×15h + 2×24h" (from day totals), segment_ids }` | Production stores **segments per day** (`18:00-00:00` + `00:00-09:00`, item 63), so rotations group **already-collapsed day groups**. Rotation ends at payroll-period boundary; month section = period month. |
| Leave **By Month** (`range`) | **New:** `lib/leaveRangeGroups.ts` (`buildMonthlyLeaveSections`, `buildLeaveRangeClusters`) | Start month; inside it, clusters of overlapping requests or gaps `≤ 2` days (`bridgeGapDays = 2`). Adds `cluster_id`, `cluster_size`, `cluster_label`, `team_peaks[]`, `continues_next_month`. | Day counts use server **`days_requested`** (`days_counted` snapshot, holiday + half-day aware) — **never** mockup's weekend-only `countWorkingDays`. Rejected leaves excluded from overlaps/peaks; cross-month leave listed once with continues hint. |

### UI Components & Layout

- **Header (`PageShell actions` in `TeamManagementPage.tsx`):** `Chip` `"Pending (n)"` (`pressed` when `filterStatus === "pending"`) + outline `Export` button (`size="control"`). No `+ Log request` button.
- **KPI Strip (`TeamOverviewCard.tsx`):** `grid grid-cols-2 gap-4 lg:grid-cols-4` of `StatCard` (`onClick` + `pressed`):
  - **Teams:** subtitle `"n members"`; toggles `memberGroupMode="team"`.
  - **Vacation left:** `iconTone="success"`; switches to `leave` tab; avg per member guarded against `/ 0`.
  - **Overtime (mo):** `iconTone="warning"`; delta `"+X h awaiting approval"`.
  - **Standby (mo):** `iconTone="danger"`.
  - Monthly hours use current Tirane month (`calcHours` updated to take `status: "approved" | "pending"`).
- **2-Tier Toolbar (`TeamFilterBar.tsx` inside one `GlassCard`):**
  - **Tier 1:** Radix `Tabs` for category (record counts as `Badge`; icons hidden `< sm`) + `FilterChipRow` for grouping (`By Day` / `By Rotation` / `By Month`, `List`, `By Team`, `By Manager`).
  - **Tier 2:** `FilterToolbar` with `FilterToolbar.Search` (`SearchField`, `controlSize="lg"`), status `Select` (with counts), team `Select`, `DateRangePicker`, and `ActiveFilterChips` below when active.
  - Drop the mockup's grey pill track (third surface). Any filter/tab change clears `rowSelection`.
- **Collapsible Monthly Sections (`TeamGroupedTables.tsx`):**
  - Add `buildSections` prop keyed by month (newest first). Each section is a `GlassCard` with a collapsible header `button` (`aria-expanded`, `aria-controls`, month label, right-aligned `n blocks/rotations/requests · Σh/d · n pending` in `toneTextClass.warning`, `border-b border-border/60 px-4 py-2.5 text-xs tabular-nums`) and one `DataTable`.
  - Shared `RowSelectionState` across sections (keys = record ids). Group/section select-all ignores `TriStateCheckbox` cycling and sets select-all/clear from current state.
  - Collapse animation: `AnimatePresence` (`framer-motion`) + `useMotionTransition({ duration: DURATION.fast, ease: EASE.standard })`.
  - Range-mode columns: OT `blocks` (`OvertimeHoursBadge` chips), Standby `breakdown` (date range + consecutive days + tier breakdown), Leave `overlap` (`CalendarRange` + range + `"n overlapping (Σd)"` + same-team peak warning chip; subsequent rows show `"same window"`).
  - Row accent: `getRowClassName` composes `cn("hover:bg-table-hover", clustered && "shadow-[inset_3px_0_0_hsl(var(--tone-info-text))]")`.
  - Mixed group status: `StatusBadge` with `variant="pending" label="2/7 pending"`. Approve/reject sends **pending** ids only.
- **Detail Drawer (`RecordDetailModal.tsx`):**
  - Add opt-in `layout="panel"` rendering `DialogContent side="right" size="panel"` (keeping `side="bottom"` default so the other 4 pages—TL Approvals, Overtime, Standby, Leave—remain unchanged).
  - Accept `siblings` prop rendered as `DetailDrawerSection`s (same-day OT blocks, standby rotation days, overlapping non-rejected leaves) computed from loaded rows + full team list (zero extra network requests).
- **Mobile (`375px`):**
  - New `mobileCard` specs: `TEAM_OVERTIME_DAY_CARD`, `TEAM_STANDBY_ROTATION_CARD`, `TEAM_LEAVE_CARD` (add `"overlap"`). Existing `TEAM_*_CARD` specs stay for `List` / `By Team` / `By Manager`.
  - Month strips use `flex-wrap`; `BulkActionBar` clears bottom nav (`bottom-[var(--bottom-nav-h,0px)] md:bottom-0`); panel drawer is `min(480px, 100vw)`.

### Token Mapping (Mockup → Production)

| Mockup Class | Production Token / Class |
|---|---|
| `bg-white` | `bg-card` |
| `bg-slate-50/70` table head | `TABLE_HEAD_GRID_CLASS` / `DataTable` header |
| `bg-slate-50/90` section strip | `bg-muted/30` or `border-b border-border/60` |
| `bg-slate-50/45` band row | `bg-muted/20` |
| `hover:bg-slate-50` / `slate-100` | `TABLE_ROW_HOVER_CLASS` (`hover:bg-table-hover`) |
| `bg-slate-100` | `bg-muted` (prefer `UserCell`) |
| `text-slate-900` / `-800` | `text-foreground` |
| `text-slate-700` / `-600` | `text-foreground` (medium) / `text-muted-foreground` |
| `text-slate-500` / `-400` | `text-muted-foreground` |
| `text-slate-300` dots | `text-muted-foreground/50 aria-hidden` |
| `border-slate-200`, `border-slate-100` | `border-border`, `TABLE_BODY_DIVIDER_CLASS` |
| `text-emerald-*` / `bg-emerald-50` | `toneTextClass.success` / `toneSurfaceClass.success` |
| `text-amber-*` / `bg-amber-50` | `toneTextClass.warning` / `toneSurfaceClass.warning` |
| `text-red-*` / `bg-red-50` | `toneTextClass.danger` / `toneSurfaceClass.danger` |
| `bg-blue-50` selected / active pill | `bg-primary/10` (`DataTable`) / `Chip pressed` |
| `text-blue-700` links | `text-primary hover:text-primary-hover` |
| `bg-emerald-600` / `amber-600` / `red-700` bars | `toneFillClass.*` |
| `text-[11px]`, `text-[10px]` | `text-xs` |

---

## 6. Cross-App Shadcn / Radix UI Rollout

1. **Add `@radix-ui/react-dropdown-menu`** to `frontend/package.json` and create `frontend/src/components/ui/dropdown-menu.tsx` (tokenized from mockup's 65-line template).
2. **Migration targets (replacing hand-rolled `Popover` menus):**
   - `frontend/src/pages/admin/components/DashboardActionsMenu.tsx` (hand-rolled `role="menu"` with arrow-key roving, L51-138) — **first migration**.
   - `frontend/src/plugins/tl_scorecard/components/records/RecordListPanel.tsx` (`MoreHorizontal` row menu).
   - `frontend/src/plugins/tl_scorecard/components/ExportButton.tsx`, `frontend/src/pages/hours_logs/components/HoursLogExportButtons.tsx`, `frontend/src/plugins/engagement/pages/EngagementMetricsPage.tsx` (export pickers).
   - `frontend/src/components/layout/MobileBottomNav.tsx` ("More" menu).
   - `frontend/src/pages/calendar/components/CalendarHeader.tsx` (audit case-by-case; keep `Popover` for date/user pickers).
3. **Keep existing production primitives** (do not replace with mockup copies): `button.tsx`, `checkbox.tsx`, `TriStateCheckbox.tsx`, `dialog.tsx`, `popover.tsx`, `select.tsx`, `tooltip.tsx`, `BulkActionBar.tsx`, `DetailDrawer.tsx`.

---

## 7. Phased Execution & Verification Plan

- **Phase 1 — Pre-Port Bug Fixes (Test-First):**
  - Fix dead row selection on `/team`, hard-coded bulk reject reason, 500-row truncation in `useTeamManagement`, and key-based bucketing in `standbyDayGroups.ts`.
  - Add failing tests first in `standbyDayGroups.test.ts`, `useTeamManagement` tests, and new `TeamManagementPage.test.tsx`.
- **Phase 2 — Pure Grouping Helpers & Tests:**
  - Implement + unit-test `overtimeDayGroups.test.ts`, `standbyDayGroups.test.ts` (rotations), and `leaveRangeGroups.test.ts`.
- **Phase 3 — `/team` UI Modernization:**
  - Update `TeamManagementPage.tsx`, `TeamOverviewCard.tsx`, `TeamFilterBar.tsx`, `TeamGroupedTables.tsx`, `useTeamColumns.tsx`, `RecordDetailModal.tsx` (`layout="panel"`), and `TeamExportDialog.tsx` (prefill only, always `team_only: true`).
  - Add component tests (`TeamManagementPage.test.tsx`, `TeamGroupedTables`, `RecordDetailModal`, `TeamExportDialog` parameter matrix) + backend export scope tests (leader's own rows, moved-employee rows, `team_only=1` baseline).
- **Phase 4 — Cross-App `DropdownMenu` Rollout:**
  - Install `@radix-ui/react-dropdown-menu`, create `ui/dropdown-menu.tsx`, migrate `DashboardActionsMenu.tsx` and export/row menus.
- **Phase 5 — Full Gates & Browser Verification:**
  - Unit/component: `cd frontend && npx vitest run` (targeted then full)
  - Typecheck, lint, format, build: `npx tsc -b`, `npx eslint <touched>`, `npx prettier --check <touched>`, `npm run build`
  - UI audit scripts:
    - `node scripts/table-header-audit.mjs`
    - `node scripts/control-audit.mjs --strict --exclude=src/plugins/engagement`
    - `node scripts/surface-audit.mjs --strict --exclude=src/plugins/engagement`
    - `node scripts/modal-audit.mjs`
  - E2E (`frontend/e2e/team-overview.spec.ts` on `chromium` + `mobile-chromium` against fresh `db.e2e.sqlite3`): `e2e_tl` (By Day, select → bulk approve, reject with reason, drawer siblings, 375px cards + bulk bar above tab bar) and `e2e_tl_hr` (`team_only=true` export assertion).
  - Manual browser click-through in light & dark mode comparing against `team-overview-design`.
