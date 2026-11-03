# Calendar hub parity, round 2 (2026-11-03)

## Primary goal

An employee or Manager opening `/calendar` sees staffing risk in every view (month, week, timeline), can open any day's full event list without triggering a booking, and sees a feed that stays fresh while the tab is open, all without a single backend change.

## Current state (verified 2026-11-03)

- Done in the working tree, uncommitted: full-bleed shell, auto-collapsed app sidebar, flat toolbar, Team Layers sidebar, compact bottom strip.
- Done, found while planning: `DayEventsDialog.tsx` (+ test), `onShowDayEvents` wiring through `CalendarDayCell` / `MonthGrid` / `CalendarPageMain` / `CalendarPageModals` / `useCalendarPageData`, and `refetchInterval: 60_000` on the standby and leave queries. Calendar vitest: 229 passed. `tsc -b`: clean.
- Month cells already carry the conflict border (`border-tone-warning-border border-2`) and badge.
- Gap: `WeekView` and `TimelineView` show no staffing conflict at all; the conflict map (`buildDayConflicts`) is only handed to the month grid.
- Gap: plan `2026-11-02-calendar-hub-layout-refactor.md` still claims all 7 phases done with specs the code no longer matches (`w-48 xl:w-56`, pinned snapshot card, `ConcisePopover`).

## Phase 0: Discovery (done)

**How this serves the primary goal:** it stops us rebuilding what exists.

Allowed APIs (all verified in tree): `DayConflict` / `buildDayConflicts` (`useCalendarPageData`), `ConflictTooltip`, `toneFillClass`, tone tokens `border-tone-warning-border`, `bg-tone-warning-surface`, `text-tone-warning-text`. Mockup references: `team-vacation-shared-calendar-hub/src/components/{WeekView,TimelineView,MonthView}.tsx`.

Designer verdicts on mockup ideas:

| Idea | Verdict | Reason |
|---|---|---|
| Amber ring + pulse badge on conflict days | Adopt in week/timeline, **no pulse** | Pulse fails reduced-motion; border + badge is enough |
| Week view as 7 tall day columns with cards | Reject | Production week is a per-person grid; it scales to real rosters, the mockup's does not |
| Timeline weekend = Sat/Sun as index 5,6 | Reject | Mockup bug; production uses dow 0/6 correctly |
| ConcisePopover / EmployeeHoverPopover | Already covered | `EventTooltip` / `ConflictTooltip` / `OverflowTooltip` |
| RequestTimeOff / VacationBalance / RecordDetail / Conflicts modals | Already covered | `CalendarFormDialog`, `UserStatusModal`, `EventActionModal`, `ConflictsModal` |
| 9-11px text, raw slate/indigo | Reject | House rule: >= 12px, tone tokens |
| Lowering `useIsBelowXl` | Reject | Gives ~80px day columns |

## Phase 1: Conflict markers in week and timeline

**How this serves the primary goal:** staffing risk becomes visible in every view, not only month.

- Pass the existing `dayConflicts` map from `CalendarPageMain` into `WeekView` and `TimelineView` (optional prop, default empty, no behaviour change when absent).
- `WeekViewDayHeader` and the timeline day header: when a day has a conflict, add the warning tone border-b plus the same compact badge (`aria-label` as in `CalendarDayCell`), wrapped in `ConflictTooltip`.
- Timeline body: tint the conflicting day column `bg-tone-warning-surface/40` (no pulse).
- Copy the pattern from `CalendarDayCell.tsx` lines 99-145; do not re-derive the rule.
- Tests first: header renders badge only for conflict dates; no prop = no badge.
- Guard: no new hook, no second conflict rule, no raw palette, no `animate-pulse`.

## Phase 2: Real-device check of the three views

**How this serves the primary goal:** proves the markers fit at real widths.

- Seed three temporary approved leaves (as in the 2026-11-02 audit), drive CloakBrowser, record month/week/timeline geometry at 1280, 1024, 768 and 375 widths via DOM measurement (screenshots are unreliable here), then delete the rows.
- Pass: no horizontal page overflow, badge visible at >= 31px day cells, tooltip opens on hover and focus.

## Phase 3: Docs rewrite

**How this serves the primary goal:** the next session must not rebuild or regress this.

- Rewrite `2026-11-02-calendar-hub-layout-refactor.md` to reality: flat cards, auto-collapse, no pinned snapshot, `min-h-0` instead of `min-h-screen`, the verdict table above.
- `docs/workflow-invariants.md` item 53: add day-details dialog rule (`+N more` never books), 60 s foreground poll as a deliberate exception, week/timeline conflict markers.
- `.devin/tracking/agents-archive-2026-11-02.md`: append this round. Update `DESIGN.md` calendar row.

## Phase 4: Verify

**How this serves the primary goal:** evidence, not assertion.

From `frontend/`: `npx vitest run src/components/calendar src/pages/calendar`, `npx tsc -b`, `npx eslint` and `npx prettier --check` on touched files, `node scripts/control-audit.mjs --strict`, `surface-audit.mjs`, `modal-audit.mjs`, `table-header-audit.mjs`, then full `npx vitest run` and `npm run build` once. Grep guards: no `animate-pulse`, no `text-[9px]`/`text-[10px]`, no `slate-`/`indigo-` in touched files. Nothing is committed or pushed.

## Not now

Hover-cursor-anchored popover engine, command-palette rework, lowering the sidebar breakpoint, any backend or new endpoint, server push for "real-time".
