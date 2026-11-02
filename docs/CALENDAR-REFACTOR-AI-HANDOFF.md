# Calendar Hub Layout Refactor — AI Reviewer Handoff Guide

This document is prepared for an incoming AI reviewer or human auditor to review, compare, and verify the layout refactoring of the Calendar Hub in `Engineering_tracker`.

---

## 1. Context & Purpose

The user created a standalone Vite/React mockup prototype in `team-vacation-&-shared-calendar-hub` to serve as a design reference for refactoring the Calendar Hub page (`frontend/src/pages/calendar/` and `frontend/src/components/calendar/`).

The refactoring incorporates the visual hierarchy, density options, sidebar collapse, timeline Gantt view, multi-team selector, and elevated metrics modals from the mockup, while adhering strictly to existing Django backend data contracts and the project's design system tokens.

---

## 2. How to Run Both Applications for Comparison

### Reference Mockup Prototype

- **Path**: `team-vacation-&-shared-calendar-hub/`
- **Installation**:
  ```powershell
  cd "team-vacation-&-shared-calendar-hub"
  npm install --legacy-peer-deps
  ```
- **Run Server**:
  ```powershell
  # Using node directly avoids Windows npm wrapper cmd bugs
  node "node_modules/vite/bin/vite.js" --port 3000 --host 127.0.0.1
  ```
- **URL**: `http://127.0.0.1:3000/`

### Production Application (`Engineering_tracker`)

- **Backend (Django 6.1.1 + Python 3.14)**:
  ```powershell
  py -3.14 manage.py runserver 127.0.0.1:8000
  ```
- **Frontend (Vite + React 19 + TypeScript)**:
  ```powershell
  cd frontend
  npm run dev -- --host 127.0.0.1
  ```
- **URL**: `http://127.0.0.1:5173/calendar` (e2e credentials: user `e2e_employee_a`, pass `e2e_pass_2026`)

---

## 3. Scope Boundaries: In-Scope vs. Intentional Exclusions

### In Scope (Implemented & Adapted)

1. **Docked Sidebar (`w-48 xl:w-56`) & Collapsible Rail (`w-12`)**:
   - Integrated `CalendarSnapshotCard` directly in sidebar top slot.
   - Rail collapse hides text while preserving quick avatar status, month navigation, and `15d` badge.
2. **Segmented View Switcher**:
   - `Month` | `Week` | `Timeline` | `List` with `aria-pressed` states.
3. **Timeline Gantt View (`TimelineView.tsx`)**:
   - Dynamic `daysInMonth` calculation (`date-fns getDaysInMonth`), member avatar rows, event indicators (`V`, `S`, `SB`), weekend tinting, and today indicator.
4. **Density Toggle (`Normal` vs. `Compact`)**:
   - Persisted to `localStorage`. Normal allows 2 visible event slots per cell; Compact allows 3 visible event slots with streamlined single-row initials pills (`EventCard.tsx`) and an interactive `+N more` overflow pill.
5. **Staffing Reassurance Badge**:
   - Green `✓ Full Staffing` badge when 0 conflicts exist; switches to `⚠️ N Conflicts` badge when conflicts occur.
6. **Multi-Team Checklist Selector (`WorkspaceDropdown.tsx`)**:
   - Radix popover dropdown with squad search, individual checkboxes, member headcount chips, color dots, and "All · Single" action links.
7. **Elevated Vacation Balance Modal (`UserStatusModal.tsx`)**:
   - Rotated plane icon badge, entitlement subtitle, 44px touch targets (`h-11 w-11`), percentage badge, stacked dual-tone progress bar, 3 metric cards, and upcoming statutory holidays list.
8. **Streamlined Bottom Metrics Bar (`CalendarBottomCards.tsx`)**:
   - High-density 3-card grid: Vacation Balance (clickable to open modal), Carryover Allowance, and Staffing Alerts.

### Strictly Excluded (No Backend Support)

- **Backup Colleague Field**: The mockup includes `backupMemberId` on leave requests. The Django `LeaveRequest` model does not have this field; per project invariants, no phantom fields were introduced.
- **Multi-Tenant Corporate Org Switcher**: Mockup switcher (`INFRA_MSC`) omitted; workspaces/teams represent the calendar boundary.
- **Custom Markdown Leave Policy Editor**: Mockup policy tab omitted; company leave policy is controlled by company settings.

---

## 4. Complete List of Touched & Created Files

### Created Files

| File Path                                                           | Description                                                       |
| :------------------------------------------------------------------ | :---------------------------------------------------------------- |
| `frontend/src/components/calendar/TimelineView.tsx`                 | Dynamic Gantt horizontal timeline view component.                 |
| `frontend/src/components/calendar/TimelineView.test.tsx`            | Unit tests for TimelineView (renders grid, avatars, empty state). |
| `frontend/src/components/calendar/WorkspaceDropdown.test.tsx`       | Unit tests for multi-team dropdown popover checklist.             |
| `frontend/scripts/calendar-refactor-autocheck.mjs`                  | Automated mechanical compliance gate for calendar contracts.      |
| `docs/superpowers/plans/2026-11-02-calendar-hub-layout-refactor.md` | Detailed 8-phase implementation plan with verification evidence.  |
| `docs/calendar-hub-workflow-and-contracts.md`                       | Tracked architecture contracts, layout tokens, and invariants.    |

### Modified Files

| File Path                                                        | Nature of Changes                                                                                        |
| :--------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------- |
| `frontend/src/components/calendar/types.ts`                      | Added `"timeline"` to `CalendarViewMode`; added `CalendarDensity = "normal" \| "compact"`.               |
| `frontend/src/pages/calendar/hooks/useCalendarPageData.ts`       | Added persistent `density` state (`localStorage`), view mode handler, and toggle helper.                 |
| `frontend/src/pages/calendar/components/CalendarHeader.tsx`      | Added Timeline tab, Normal/Compact toggle, `✓ Full Staffing` badge, and `WorkspaceDropdown` integration. |
| `frontend/src/components/calendar/WorkspaceDropdown.tsx`         | Converted single select into multi-team popover checklist with color dots & badges.                      |
| `frontend/src/components/calendar/CalendarSidebar.tsx`           | Adjusted width to `w-48 xl:w-56`, added snapshot card slot, tightened typography and padding.            |
| `frontend/src/components/calendar/CollapsedCalendarSidebar.tsx`  | Narrowed rail to `w-12`, added remaining vacation days badge (`15d`), icon buttons with aria-labels.     |
| `frontend/src/components/calendar/CalendarSnapshotCard.tsx`      | Redesigned into compact sidebar card with progress meter and modal trigger button.                       |
| `frontend/src/pages/calendar/components/CalendarPageShell.tsx`   | Integrated collapsible sidebar rail layout, snapshot card container, and responsive spacing.             |
| `frontend/src/pages/calendar/components/CalendarPageMain.tsx`    | Wired `TimelineView` rendering when `viewMode === "timeline"`.                                           |
| `frontend/src/components/calendar/MonthGrid.tsx`                 | Passed `density` prop down to day cells.                                                                 |
| `frontend/src/components/calendar/CalendarDayCell.tsx`           | Capped event slots (2 for Normal, 3 for Compact) and interactive `+N more` pill.                         |
| `frontend/src/components/calendar/EventCard.tsx`                 | Single-row compact layout: initials chip, truncated label, duration tag (`3d`).                          |
| `frontend/src/components/calendar/UserStatusModal.tsx`           | Redesigned modal with 44px close button, rotated plane badge, stacked progress bar, and metrics.         |
| `frontend/src/pages/calendar/components/CalendarBottomCards.tsx` | Streamlined 3-card metrics grid with tone tokens and click handler to open vacation modal.               |
| `frontend/src/pages/calendar/CalendarPage.tsx`                   | Connected density and modal callbacks between shell, header, and bottom cards.                           |
| `frontend/src/components/calendar/CalendarDayCell.test.tsx`      | Updated cell slot capping tests for density modes.                                                       |
| `frontend/src/components/calendar/EventCard.test.tsx`            | Updated event card rendering assertions for compact initials chips.                                      |

---

## 5. Verification Commands & Quality Gates

Run these commands in PowerShell from the repository root to verify complete health:

```powershell
# 1. Mechanical Calendar Contract Autocheck (Must PASS)
node frontend/scripts/calendar-refactor-autocheck.mjs

# 2. Targeted Calendar Vitest Suite (170/170 tests passing across 32 files)
cd frontend; npx vitest run src/components/calendar src/pages/calendar

# 3. TypeScript Compilation (0 errors)
cd frontend; npx tsc -b

# 4. Table Header Audit Gate (0 violations)
cd frontend; node scripts/table-header-audit.mjs

# 5. ESLint on Touched Calendar Files (0 errors, 0 warnings)
cd frontend; npx eslint src/components/calendar/ src/pages/calendar/
```

---

## 6. What to Compare in the Live Browser

When opening `http://127.0.0.1:5173/calendar` alongside `http://127.0.0.1:3000/`:

1. **Header**: Check view modes (Month/Week/Timeline/List) and density switcher (Normal vs. Compact). Observe the green `✓ Full Staffing` badge.
2. **Teams Dropdown**: Click the team selector to verify the popover checklist with checkboxes, color dots, and "All · Single" toggles.
3. **Sidebar**: Click the collapse button on the sidebar to observe transition to the `w-12` icon rail with the `15d` badge, and click expand to restore.
4. **Timeline View**: Click `Timeline` tab to inspect the horizontal Gantt chart with daily columns, user rows, event badges, and weekend shading.
5. **Month View Density**: Toggle between `Normal` and `Compact` to see event cards switch between standard cards and compact single-row initials pills (`[ 👤 Sarah M. · 3d ]`).
6. **Vacation Modal**: Click "View details" on the Vacation Balance bottom card to inspect the modal header, 44px touch targets, stacked progress bar, and statutory holidays.
7. **Mobile Responsiveness**: Resize viewport to 375px; verify 0px horizontal overflow (`scrollWidth === clientWidth`) and mobile sidebar drawer toggle.
