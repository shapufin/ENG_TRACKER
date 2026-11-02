# Calendar Hub Layout Refactor & Mockup Adoption Plan

> **Summary**: Refactor the production Calendar surface (`frontend/src/pages/calendar/` and `frontend/src/components/calendar/`) to adopt the high-density layout, synchronized team layers, compact sidebar, concise hover popovers, and Gantt timeline view from the `team-vacation-&-shared-calendar-hub` mockup, strictly respecting existing Django backend boundaries.

---

## 1. Objective & Success Criteria

1. **Compact Docked Sidebar**: `CalendarSidebar` refactored from `200px` to `w-48 xl:w-56` (192px-224px) with smooth collapse to `w-12` icon rail, embedding `CalendarSnapshotCard` as a pinned base widget to free 80px+ horizontal width for calendar cells.
2. **Synchronized Multi-Team Layer Filter**: Replace confusing single/multi workspace controls with the mockup's unified multi-team checklist dropdown in `CalendarHeader`, fully bidirectionally synced with the sidebar's squad checkboxes via `CalendarWorkspaceContext`.
3. **Timeline (Gantt) View Mode**: Add `TimelineView` (`Month`, `Week`, `Timeline`, `List`) giving team leaders a horizontal squad capacity & leave overlap timeline across all days of the selected month (with dynamic `daysInMonth` handling).
4. **Capped Cell Slots & Density Toggle**: Normal density (capped at 2 event slots) and Compact density (capped at 3 slots with short-code badges `[AS] 2d`), cleanly delegating remaining items to an accessible `+N more` pill.
5. **Concise Hover & Deep Click Popovers**: Zero-latency 260px hover inspector (`ConcisePopover`) displaying member avatar, leave duration, and live coverage warnings; click opens deep record inspection with cancellation CTA.
6. **Elevated Vacation Balance Modal**: Redesign user status dialog with radial progress ring, remaining percentage breakdown, and upcoming statutory holidays list.
7. **Zero Regression Baseline**: All 160 existing calendar tests in `frontend/src/components/calendar` and `frontend/src/pages/calendar` continue to pass (`30 test files, 160 tests passed`).
8. **Automated Gate Checking**: Mechanical script (`scripts/calendar-refactor-autocheck.mjs`) verifying class tokens, responsive bounds, and test counts after every phase.

---

## 2. Scope Boundaries (Backend Feasibility & What Stays OUT)

### IN Scope (Frontend Adoption)
- Layout refactor of `CalendarPageShell.tsx`, `CalendarHeader.tsx`, `CalendarSidebar.tsx`, `CalendarPageMain.tsx`.
- Introduction of `TimelineView.tsx` and `ConcisePopover.tsx`.
- Capped event slots and `+N more` overflow behavior in `MonthGrid.tsx` / `CalendarDayCell.tsx`.
- Density toggle (`Normal` / `Compact`) wired into `CalendarHeader.tsx` and `useCalendarPageData.ts`.
- Redesign of `CalendarSnapshotCard.tsx` and `CalendarBottomCards.tsx` into streamlined metrics bar.
- Redesign of `UserStatusModal.tsx` to match the mockup's elevated `VacationBalanceModal`.

### OUT of Scope (Backend Not Implemented — DO NOT INVENT)
- **Designated Standby / Backup Colleague (`backupMemberId`)**: `apps/leave_management/models.py:LeaveRequest` has no backup member field; standby is handled separately via `apps/standby/models.py:StandbyLog`. Omit from forms.
- **Multi-Tenant Org Switcher (`INFRA_MSC`)**: Engineering tracker is single-organization scoped by team/workspace. Header stays pinned to the active workspace name.
- **Custom Markdown Policy Editor**: Leave policies remain static text based on company HR rules.

### DO-NOT-TOUCH List
- `ConflictCard.tsx` — pinned by `ConflictCard.test.tsx`.
- `hooks/useWorkspaceData.ts` — contains typed data mappings, not class tokens.
- `apps/leave_management/` and `apps/standby/` backend models and migrations.

---

## 3. Phase Breakdown & Execution Plan

```
┌────────────────────────────────────────────────────────┐
│ Phase 1: Shared Styles, Types & Autocheck Harness     │
│ ├── Define CalendarDensity type & token classes        │
│ └── Create scripts/calendar-refactor-autocheck.mjs     │
├────────────────────────────────────────────────────────┤
│ Phase 2: Compact Docked Sidebar & Pinned Snapshot      │
│ ├── Refactor CalendarSidebar.tsx to w-48 xl:w-56       │
│ ├── Embed CalendarSnapshotCard as pinned footer        │
│ └── Add team layer checklist with color dots           │
├────────────────────────────────────────────────────────┤
│ Phase 3: Toolbar Modernization & Multi-Team Checklist  │
│ ├── Unified Teams (N) dropdown in CalendarHeader.tsx   │
│ ├── 4-mode segmented switcher (Month/Week/Timeline/List)│
│ └── Normal/Compact density toggle control              │
├────────────────────────────────────────────────────────┤
│ Phase 4: Timeline (Gantt) View Component               │
│ ├── Create TimelineView.tsx with dynamic daysInMonth   │
│ └── Wire into CalendarPageMain.tsx and viewMode state  │
├────────────────────────────────────────────────────────┤
│ Phase 5: Month Cell Density & Concise Popover Engine   │
│ ├── Slot capping (max 2/3) + +N more in CalendarDayCell│
│ └── ConcisePopover.tsx zero-latency hover preview      │
├────────────────────────────────────────────────────────┤
│ Phase 6: Elevated Vacation Balance & Modals Polish     │
│ ├── Redesign UserStatusModal to elevated balance UI    │
│ └── Streamline CalendarBottomCards.tsx metrics bar     │
└────────────────────────────────────────────────────────┘
```

---

## 4. Detailed Component Specifications

### 4.1 Phase 1: Shared Density & Autocheck
- **Files touched**:
  - `frontend/src/components/calendar/types.ts`
  - `frontend/src/pages/calendar/hooks/useCalendarPageData.ts`
  - `frontend/scripts/calendar-refactor-autocheck.mjs` (new)
- **Specification**:
  - Add `export type CalendarDensity = 'normal' | 'compact';` to `types.ts`.
  - Add `density: CalendarDensity` and `setDensity: (d: CalendarDensity) => void` in `useCalendarPageData.ts` (persisted in localStorage `calendar_density`).

### 4.2 Phase 2: Compact Docked Sidebar & Pinned Snapshot
- **Files touched**:
  - `frontend/src/components/calendar/CalendarSidebar.tsx`
  - `frontend/src/pages/calendar/components/CalendarPageShell.tsx`
  - `frontend/src/components/calendar/CalendarSnapshotCard.tsx`
- **Specification**:
  - In `CalendarPageShell.tsx`:
    - Grid layout: `xl:grid-cols-[192px_minmax(0,1fr)] 2xl:grid-cols-[224px_minmax(0,1fr)]` (collapsed: `xl:grid-cols-[48px_minmax(0,1fr)]`).
  - Move snapshot card inside the bottom of `CalendarSidebar.tsx` as a pinned, compact container.

### 4.3 Phase 3: Toolbar Modernization & Multi-Team Checklist
- **Files touched**:
  - `frontend/src/pages/calendar/components/CalendarHeader.tsx`
  - `frontend/src/components/calendar/WorkspaceSelector.tsx`
  - `frontend/src/components/calendar/WorkspaceDropdown.tsx`
- **Specification**:
  - `CalendarHeader.tsx` adopts single-row flex-wrap layout:
    - Left: `WorkspaceSelector` styled as `Teams (N)` button with active count badge.
    - Center: `< Today > Month Year` with prominent `N Conflicts` pill.
    - Right: View switcher `[Month] [Week] [Timeline] [List]`, Density toggle `[Compact/Normal]`, `+ Request Time Off` CTA, Export menu.

### 4.4 Phase 4: Timeline (Gantt) View
- **Files created/touched**:
  - `frontend/src/components/calendar/TimelineView.tsx` (new)
  - `frontend/src/components/calendar/TimelineView.test.tsx` (new)
  - `frontend/src/pages/calendar/components/CalendarPageMain.tsx`
- **Specification**:
  - Horizontal calendar layout showing team member rows along the Y axis and days 1..N of the current month on the X axis.
  - Dynamically computes column grid `grid-cols-[200px_repeat(${daysInMonth},_minmax(32px,_1fr))]` preventing any month-length layout wrapping bugs.

### 4.5 Phase 5: Month Cell Density & Concise Popover Engine
- **Files created/touched**:
  - `frontend/src/components/calendar/ConcisePopover.tsx` (new)
  - `frontend/src/components/calendar/CalendarDayCell.tsx`
  - `frontend/src/components/calendar/MonthGrid.tsx`
- **Specification**:
  - In `CalendarDayCell.tsx`:
    - Max items shown = `density === 'compact' ? 3 : 2`.
    - Overflow pills rendered as `+N more` opening the day inspector.
    - On hover: trigger lightweight `ConcisePopover` positioned via fixed viewport coordinates.

### 4.6 Phase 6: Elevated Vacation Balance & Modals
- **Files touched**:
  - `frontend/src/components/calendar/UserStatusModal.tsx`
  - `frontend/src/pages/calendar/components/CalendarBottomCards.tsx`
- **Specification**:
  - Update `UserStatusModal.tsx` with radial progress bar, 3 metric cards (Remaining, Used, Pending), and upcoming statutory holidays list.
  - Streamline `CalendarBottomCards.tsx` to a high-density 3-card bottom metrics bar matching the mockup.

---

## 5. Self-Correction Protocol & Autocheck Gates

After each phase, run the autocheck script:
```powershell
node frontend/scripts/calendar-refactor-autocheck.mjs
cd frontend; npx vitest run src/components/calendar src/pages/calendar
```

### Decision Table for Gate Failures

| Failure Mode | Root Cause | Exact Remediation |
| :--- | :--- | :--- |
| **Existing Vitest Test Fails** | Component API or test-pinned selector modified | Revert unintended props deviation; preserve existing test contract. |
| **Horizontal Viewport Overflow (<380px)** | Hardcoded min-widths or unconstrained flex containers | Apply `min-w-0 overflow-hidden truncate` and collapse secondary buttons on mobile. |
| **Timeline Grid Misalignment** | Hardcoded 30-day template columns in 31/28 day months | Ensure inline style uses dynamic `daysInMonth`. |
| **Missing Accessible Name** | Icon buttons rendered without `aria-label` | Add explicit `aria-label` and `title` to all button elements. |
| **Typecheck Failure (`tsc -b`)** | Density or ViewMode union type mismatch | Ensure `'timeline'` is added to `types.ts:CalendarViewMode`. |

---

## 7. Execution Outcome & Verification Evidence (2026-11-02)

All 7 phases completed and verified against strict design system, accessibility, and zero-regression criteria:

1. **Vitest Unit Test Suite**:
   - **Command**: `cd frontend; npx vitest run src/components/calendar src/pages/calendar`
   - **Result**: **PASS — 31 test files passed, 165/165 tests passed** (increased from 160 baseline with new tests for `TimelineView`, `CalendarDayCell` density, and compact slots).
2. **TypeScript Compilation**:
   - **Command**: `cd frontend; npx tsc -b`
   - **Result**: **PASS — 0 errors, exit code 0**.
3. **Table Header Audit Gate**:
   - **Command**: `cd frontend; node scripts/table-header-audit.mjs`
   - **Result**: **PASS — 0 violations across 969 files**.
4. **Mechanical Autocheck Gate**:
   - **Command**: `node frontend/scripts/calendar-refactor-autocheck.mjs`
   - **Result**: **PASS — All mechanical calendar checks PASSED!**
5. **Linting & Code Quality**:
   - **ESLint**: `npx eslint <touched>` passed with 0 errors, 0 warnings.
   - **Prettier**: `npx prettier --write <touched>` clean formatting applied.
   - **Graphify**: `graphify update .` updated (22,763 nodes, 62,563 edges, 800 communities).
6. **Live CloakBrowser Visual Signoff**:
   - Desktop 1440px Month View: Compact docked sidebar (`w-48 xl:w-56`), embedded snapshot card, density toggle (`Normal` / `Compact`), `⚠️ N Conflicts` badge, and streamlined bottom metrics bar.
   - Desktop 1440px Timeline View: Dynamic `daysInMonth` Gantt grid, user avatar rows, leave indicators (`V`, `S`, `SB`), today highlight column, and color-coded legend.
   - Desktop 1440px Collapsible Sidebar Rail: Smooth collapse to `w-12` (48px) icon rail with remaining days badge (`15d`), maximizing calendar viewport space.
   - Elevated Vacation Balance Modal: Rotated plane icon, annual entitlement subtitle, 44px touch target close button, user profile card, remaining days progress bar with percentage badge, 3 stat cards (Remaining, Used, Pending), and upcoming statutory holidays list.
   - Mobile 375px Responsiveness: `clientWidth: 375, scrollWidth: 375, overflow: false` (exact 0px horizontal overflow). Mobile sidebar drawer toggles cleanly with 44px close affordance.

## Phase 8: Final Browser Verification & End-to-End Signoff
- [x] CloakBrowser MCP live audit comparing `http://127.0.0.1:5173/calendar` directly against `http://127.0.0.1:3000/`.
- [x] Verified View Switcher in live session: Month, Week, Timeline, and List views.
- [x] Verified Density Switcher in live session: Normal (2-slot cap) and Compact (3-slot cap with single-row initials pills).
- [x] Verified Sidebar Docking & Collapse: Full docked view (`w-48 xl:w-56`), collapsed rail (`w-12`), and quick-expand controls.
- [x] Verified `WorkspaceDropdown`: Checklist popover with squad checkboxes, headcounts, color dots, and select all / single filters.
- [x] Verified `UserStatusModal`: 44px touch targets, rotated plane badge, stacked progress bar, annual entitlement metrics, and holidays list.
- [x] Verified Themes: Full visual contrast and token adherence in both Light mode and Dark mode.
- [x] Verified Mobile Responsiveness (375px viewport): Confirmed `scrollWidth === clientWidth` with 0px horizontal overflow blowout.
- [x] Verified Zero Console Errors/Warnings: `browser_console_messages` reported 0 errors, 0 warnings.
- [x] Vitest Gate: 32 test files passed, 170/170 tests passed (`cd frontend; npx vitest run src/components/calendar src/pages/calendar`).
- [x] TypeScript Gate: `npx tsc -b` exited with code 0.
- [x] Table Header Audit: `node scripts/table-header-audit.mjs` passed (0 violations across 969 files).
- [x] Mechanical Autocheck Gate: `node frontend/scripts/calendar-refactor-autocheck.mjs` passed (100% checks green).
- [x] ESLint Gate: `npx eslint src/components/calendar/ src/pages/calendar/` completely clean.

