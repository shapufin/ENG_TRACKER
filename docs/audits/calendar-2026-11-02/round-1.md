# Calendar Hub audit, round 1 (2026-11-02)

Branch `audit/calendar-2026-11-02`, started from `c2a0839` with the uncommitted layout refactor committed first as a baseline (`1ed519c`).
Scope: calendar layout refactor against the `team-vacation-&-shared-calendar-hub` mockup. Verified in a real browser (1440, 375, 280 px) against the e2e backend, as `e2e_tl` and `e2e_employee_a`.

## Resolved (each fix has a test that failed before)
| # | Finding | Severity | Commit |
|---|---|---|---|
| 1 | Team selector panel clipped by the header card (unreachable); All/Single used stale selection | HIGH | `3b05c66` |
| 2 | Header toolbar 1268px in a 1110px card at 1440px (sidebar ignored); badge hidden below 1024px; CSV/iCal same icon | HIGH | `8f1b76e` |
| 3, 6, 11 | Timeline: days 22-30 off-screen with no pinned names, mouse-only cells, raw palette, no legend, O(n*d*e) lookup | HIGH | `8c184b4`, `0537460` |
| 5 | "Today" read the browser clock in 9 places (month grid, week header, timeline, default month, Today button, request date, upcoming holidays, export names, year fallbacks) | HIGH | `09fc536` |
| 7, 8 | Duplicate vacation snapshot card; per-colleague View button that always 403'd for employees | MEDIUM | `5e33007` |
| 4 | control-audit 3 and surface-audit 28 calendar violations (micro-text, h-8, dark overrides) | HIGH | `1ed519c` to `b67f7d3` |

## Follow-up pass (same day, after round 1)
- Event window (finding 12): a date window would shrink the "View all conflicts" modal, so it was not added. A banner now warns when the capped fetch dropped entries (`3bf781e`). A leave `date_from`/`date_to` filter was built and reverted (`63383e9`, `a8ead4a`) as unused.
- Compact pills: hours/days moved to their own chip so truncation keeps the quantity. The API sends hours as a decimal string, caught only in the browser, so it is coerced.
- Phone toolbar: 313px to 269px (about 330px at the start) by ordering actions before view tabs and showing fullscreen/reset from sm.
- Balance button: shown only for members whose balance the viewer can read (an employee's map is empty, so none).
- `DataCheckPage.tsx` dark overrides replaced with the warning tone token; surface-audit now has 0 violations.
- Mockup extras: holiday pills already render in month cells (events of type holiday). The squad filter is the Teams dropdown. Per-day "Conflict (n%)" needs a coverage threshold the app does not define, so it is a product decision, not an audit fix.
- Pre-existing, unrelated: `apps.standby.test_approve_closed_period` fails on main as well.

## Mockup parity pass (after the owner asked for a side-by-side audit)
Compared the mockup (:3000) with the app at 1440, 1024, 768, 375 and 280 px in a real browser.
- Conflicts: the app counted any 2+ people on leave (pending included) and capped the header badge at 3. It now uses the mockup rule: approved vacation/sick leave, per workspace roster, coverage at or below 50%, weekends and public holidays skipped, one-person rosters ignored. One function (`lib/calendarCoverage.ts`) feeds the day badge, header count, card and modal, so they agree; the modal shows coverage. Coverage uses raw leave, not the visibility filters.
- Tablet (1024-1279 px): the member sidebar stacked above the grid and pushed it below the fold. It is now the Filters drawer below 1280 px (`useIsBelowXl`).
- The month grid forced a 720 px minimum that clipped the Sunday column beside the app sidebar at 1024 px; removed.
- Day cells: weekend tint; the Today label and the badge figure follow the cell width (container query) so nothing overlaps at 768 px.
- Hover popovers (ported from the mockup): the event card is now concise (person, type dot, date range, quantity, note) with a coverage warning on conflict days; the day badge explains itself (percent on duty, who is away); "+N more" previews the hidden entries. All open on hover or keyboard focus.
- Narrow cells: below 5rem a pill keeps only the initials (container query), so nothing clips at 375 or 280 px; Week/List keep the full pill.
- Not changed: per-team calendar colours, command palette, mockup day-summary hover ("N away, M on duty").

## Gates after round 1
Full vitest, tsc, eslint, build, control-audit, surface-audit, modal-audit, table-header-audit and the calendar autocheck pass (see the final run in the merge commit).
Browser re-measure: header card scrollWidth equals clientWidth at 1440 (was 1268 vs 1110) and at 280 (1px sub-pixel); page overflow 0 at 375 and 280; timeline names stay pinned at scrollLeft 286; "All" selects 3 of 3 teams.

## Scorecard
| | Round 1 found | Fixed | Deferred | Disproved |
|---|---|---|---|---|
| HIGH | 6 | 6 | 0 | 0 |
| MEDIUM | 5 | 2 | 3 | 0 |
| Wrong claims | 1 (finding 12 said per navigation; it is per scope) | | | |
