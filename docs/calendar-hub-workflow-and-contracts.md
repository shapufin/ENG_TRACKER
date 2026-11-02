# Calendar Hub Layout Contracts & Workflow Specification

> **Tracked Architectural Contract**: This document defines the engineering contracts, responsive breakpoints, data boundaries, and verification workflow for the Calendar Hub surface (`/calendar`).

---

## 1. Design & Layout Invariants

1. **Docked Compact Sidebar**:
   - Desktop baseline (`≥ 1024px`): Docked sidebar width is `192px` (`w-48`) to `224px` (`xl:w-56`), preserving maximum screen width for calendar day columns.
   - Collapsed rail: `48px` (`w-12`), showing only icon controls and squad indicators.
   - Mobile (`< 1024px`): Collapses into an off-canvas drawer (`w-[280px] max-w-[85vw]`), triggered by mobile filters toggle button.
   - Embedded Snapshot: The user's Vacation Balance Snapshot card is pinned to the base of the sidebar, not stacked underneath the calendar grid.

2. **Unified Multi-Team Selection**:
   - `WorkspaceSelector` uses the `Teams (N)` paradigm.
   - When multiple squads are selected via `CalendarWorkspaceContext`, their active states are mirrored in both the toolbar dropdown and sidebar squad checkboxes.
   - Each squad displays its distinct color dot and headcount.

3. **Cell Constraints & Anti-Overflow**:
   - All cell contents and flex items enforce `min-w-0 overflow-hidden` to eliminate horizontal cell expansion.
   - **Slot Capping**:
     - Normal Density: At most 2 item slots per cell.
     - Compact Density: At most 3 item slots per cell.
     - Additional events trigger an accessible `+N more` pill that opens the day details inspector.
   - Events display abbreviated badges on compact viewports (`[AS] 2d` instead of overflowing full names).
   - **Compact Single-Row Pill**: When density is compact, `EventCard` renders as a streamlined horizontal row (initials chip, compact label, pending dot, duration tag) to maximize day cell vertical capacity.

4. **Staffing Coverage Indicators**:
   - When `conflictCount > 0`: Prominent animated `⚠️ N Conflicts` pill linking directly to the Conflicts Modal.
   - When `conflictCount === 0`: Subtle `Full Staffing` reassurance badge with green checkmark.

5. **Interactive Dual-Trigger Popovers**:
   - **Hover**: Zero-latency 260px concise popover (`ConcisePopover`) displaying member avatar, duration, and capacity warnings.
   - **Click**: Opens modal inspection with deep action links (Day Schedule, Cancellation CTA).
   - **Touch Devices (< 640px)**: Tapping an event opens the mobile slide-up bottom sheet instead of fixed hover tooltips.

6. **Timeline (Gantt) Mode**:
   - Gantt layout with member rows on the Y axis and days $1 \dots N$ on the X axis.
   - Columns are computed dynamically using `daysInMonth` (28 to 31), preventing row wrapping.

---

## 2. Backend Feasibility Boundaries (Mockup vs. Production)

| Feature | Production Backend Status | Implementation Rule |
| :--- | :--- | :--- |
| **Workspace / Squad Multi-Select** | Supported via `CalendarWorkspaceContext` & `apps.permissions` | Bind toolbar & sidebar toggles directly to `selectedWorkspaceIds`. |
| **Leave Duration & Balances** | Supported via `apps.leave_management.models.LeaveBalance` | Render live balance numbers; subtract approved leave duration. |
| **Public Statutory Holidays** | Supported via `/api/leave-management/holidays/` | Render as official holiday events; exclude from vacation day deduction. |
| **Coverage Conflicts** | Supported via client-side conflict evaluation ($\le 50\%$ coverage) | Highlight conflicted dates with `⚠️` pill and badge. |
| **Designated Standby Backup Colleague** | **NOT SUPPORTED** on `LeaveRequest` model | **DO NOT IMPLEMENT IN FORMS**. Omit until backend migration is scheduled. |
| **Multi-Org Switcher (`INFRA_MSC`)** | **NOT SUPPORTED** (single-tenant architecture) | Omit tenant switcher; label header with active workspace name. |

---

## 3. Autocheck Verification Workflow

Run the following mechanical gates before and after any code changes on the calendar surface:

```powershell
# 1. Targeted Vitest Suite (must pass all 166 tests)
cd frontend; npx vitest run src/components/calendar src/pages/calendar

# 2. TypeScript Strict Check
cd frontend; npx tsc -b

# 3. Calendar Invariants Autocheck
node frontend/scripts/calendar-refactor-autocheck.mjs

# 4. Visual Verification (CloakBrowser)
# Verify at 1440px (Desktop) and 375px (Mobile)
# document.documentElement.scrollWidth === document.documentElement.clientWidth
```
