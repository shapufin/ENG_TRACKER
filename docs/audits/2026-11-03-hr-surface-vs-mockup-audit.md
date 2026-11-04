# HR surface vs. mockup audit (2026-11-03)

Audit only. No app code was changed. Branch `feat/calendar-history-holidays-dots`, HEAD `5573073` (working tree carries unrelated calendar edits).
Mockup: `hr-intelligence-&-workforce-portal/` (untracked, Vite + Tailwind 4, runs from `.claude/launch.json` entry `hr-mockup`, served on 3002 because 3001 was refused by the host).

## Index

1. Scope, method, evidence limits
2. File inventory (what the audit covers)
3. Verified findings in the current HR pages (H-1 to H-9)
4. What the mockup does better (M-1 to M-9)
5. What the mockup does worse (do not copy)
6. UI/UX gate results
7. Centralization candidates, app-wide (C-1 to C-6)
8. Deferred, open questions, proposed plan pointer

## 1. Scope, method, evidence limits

- Surface: `/hr/reports`, `/hr/team-leaders`, `/hr/calendars` (the three pages the mockup models). Out of scope: `/hr/leave-requests`, payroll runs, wage assignment, the HR dashboard.
- Risk ranking: reports and exports (numbers HR hands to payroll) deepest, TL assignment (role data writes) second, holidays (already reuses admin components) lightest.
- Method: code read of every file in section 2, live render of the app as the `e2e_hr` fixture user on the local dev stack (5173/8000) at 1440px, live render of the mockup, JS measurement for overflow, the repo's own audit scripts.
- Not measured: 280px layouts, axe, contrast ratios, keyboard walk-through, light theme of the app (the app rendered dark, the mockup is light-only). Every a11y or responsive claim below is marked `unverified` unless a measurement is cited.
- Test baseline was not taken: nothing is modified in this pass. It must be taken before the first fix batch.

## 2. File inventory

App, all under `frontend/src/pages/hr/` unless noted (2168 lines in total, 22 component files, 9 test files):
- Pages: `HRReportsPage.tsx`, `HRTeamLeaderAssignmentPage.tsx`, `HRCalendarsPage.tsx`; helpers `trendData.ts`, `hooks/useHRTeamLeaderAssignment`, `hooks/useHRHolidays`.
- Report components: `HRReportFilters`, `FilterSelect`, `HRReportActionBar`, `HRInsightsCard`, `HRReportResults`, `HRTeamLeaderBarList`, `HRTopLeadersCard`, `HRTrendChart`, `HRReportStatusCard`, `HRPersonnelTable`, `HRLeaveTable`, `HRTableShell`, `HRSearchControls`.
- Shared primitives touched: `components/ui/` (`StatCard`, `GlassCard`, `DataTable`, `DateRangePicker`, `FilterToolbar`, `SearchField`, `FilterChipRow`, `Chip`, `BulkActionBar`, `select`, `tableStyles`), `components/admin/` (`TeamLeaderSelect`, `TechFacetFilter`, `UserCell`, `HolidayTable`, `HolidayFormDialog`), hooks `useHRReportManagement`, `useHRReportQueries`.
- Mockup: `src/components/views/{ReportsView,AssignmentView,HolidaysView}.tsx`, `src/components/ui/*`, `src/components/reports/*`, `design.md`. `Modal`, `Toast`, `StatCard`, `Badge`, `DateRangePicker`, `SearchInput` and the `reports/*` charts were NOT read line by line; claims about them come from `design.md` and renders only.

## 3. Verified findings in the current HR pages

| ID | Page | Issue | Type | Severity | Evidence |
|---|---|---|---|---|---|
| H-1 | Reports | All five report queries are `enabled: false`; the page opens on an empty "HR Strategic Analysis" card until Generate is clicked, so a first visit shows no data | UX | MEDIUM | `useHRReportQueries.ts` (`enabled: false` x6), live render |
| H-2 | Reports | Export ignores the Team filter. `downloadDetailedExport` builds params without a team id and the export dialog's "Using current filter settings" list omits Team, while the on-screen queries do apply it (`team_ids`). Whether the export endpoints accept a team param is unverified | Data scope | HIGH (pending backend check) | `HRReportsPage.tsx:62-74`, `HRReportActionBar.tsx:126-139`, `useHRReportQueries.ts:28` |
| H-3 | Reports | Identity Breakdown sits in `lg:col-span-8` and overflows: measured scrollWidth 906 vs clientWidth 727 at 1440px, so "Leaves" and "Balance Left" columns are behind a horizontal scroll | Layout | MEDIUM | JS measurement, screenshot |
| H-4 | Reports | Identity Breakdown and Leave tables are not sortable and rows are not actionable. They are hand-assembled through `HRTableShell`, not `DataTable` | Feature gap | MEDIUM | `HRPersonnelTable.tsx`, JS (no sort controls) |
| H-5 | Reports | The "Search personnel" box is rendered above the Leave table only, but its query also filters the Identity Breakdown table higher up the page, so typing silently changes a table that is scrolled out of view | UX | MEDIUM | `HRReportResults.tsx:120-148` |
| H-6 | Reports | The Hours-by-Team-Leader bars and Top Leaders list are static. No click-to-filter, no hover detail, rank shown twice (bar list and ranked list repeat the same data) | UX | LOW | `HRTeamLeaderBarList.tsx`, `HRTopLeadersCard.tsx` |
| H-7 | Assignment | Bulk Manager/Line Manager selects apply the change to every selected row the moment an option is picked, with no confirm step and no summary of who changes | Integrity | MEDIUM | `HRTeamLeaderAssignmentPage.tsx:194-216` (`onChange` calls `handleBulkSetLeader`) |
| H-8 | Assignment | 28 users render 56 Radix Select triggers; the pickers have no type-ahead and no identity (avatar, team) in options, so choosing among many leaders is scan-only. At company size this is the weakest control on the page | UX | MEDIUM | `TeamLeaderSelect.tsx`, JS (56 comboboxes) |
| H-9 | Holidays | Table has no search, no "x of y" count; the title strip repeats the page title ("Holiday Catalog / Global & Workspace Holidays" under "Company Holidays") | UX | LOW | `HRCalendarsPage.tsx:40-44`, screenshot |

Disproved before listing (not findings): "HR files break the token or control rules" (the repo's control, table-header and modal audits report zero violations in `pages/hr`); "Export Center missing" (it is already merged into the insights row as the 4th slot).
Cross-cutting: filter labels are re-spelled per page (`FilterSelect` and `HRReportFilters` both carry the same uppercase label class), icons repeat (`Users` icon on three different filters). One fix, not N.

## 4. What the mockup does better

| ID | Mockup behaviour | App today | Worth adopting |
|---|---|---|---|
| M-1 | Reports page is populated on load and filters apply live | Empty until Generate (H-1) | Yes, as a product decision (see section 8) |
| M-2 | Filter strip header with "Reset All Filters" and removable Active Criteria chips (employee, department, report type, leader) | No reset, no summary of active filters | Yes: one shared `ActiveFilterChips` + reset |
| M-3 | Searchable combobox: type-ahead, avatar + team in option, clear button, keyboard nav, checkmark | Radix Select only | Yes: new shared primitive (C-1) |
| M-4 | Identity table: every column sortable, quick-sort presets, row click opens a detail panel, footer totals | Static table (H-3, H-4) | Yes via `DataTable` plus the existing right-side detail panel pattern |
| M-5 | Click a leader in the bar chart or ranked list to filter the whole report; leader shows as a chip | Static (H-6) | Yes, small |
| M-6 | Bulk assign goes through a confirm dialog naming the count and the chosen leader, then toasts | Applies instantly (H-7) | Yes, reuse `ConfirmDialog` |
| M-7 | Holidays: search, "x of y" counter, sortable Country | None of the three (H-9) | Yes, small |
| M-8 | Employee Name filter on reports | Not present | Needs data check: server filter exists? Unverified |
| M-9 | `/` focuses the page search field | Not verified in `SearchField` | Only through a guarded handler (see C-4) |

Already at parity or better in the app: KPI cards with real numbers, merged Export Center, Tech facet chips with counts and levels, server-side paging and scope, edit and confirm-delete on holidays, accessible `RowActions`.

## 5. What the mockup does worse (do not copy)

- Hardcoded Tailwind palette (`slate-*`, `blue-600`) and 10-11px text throughout; violates the token and 12px rules in `docs/ui-control-kit.md`.
- Fabricated values: "100% Approved", "Fiscal Audit Verified / Oct 2026", and a Compliance column that is always "Approved". None of it is backed by data; copying it would show wrong numbers to HR.
- Everything is client-side over an in-memory array; the app is server-scoped and paged (the payroll and confidentiality rules depend on that).
- Accessibility holes seen in code: row checkboxes without labels, chip remove "x" without a label, clickable `tr` with no keyboard path, sortable `th` as click targets without `aria-sort`, delete button visible only on hover, combobox built from `button` + `ul` with no listbox roles, employee filter keyed by name not id. (Code-read; not axe-measured.)
- "Apply" button is cosmetic; report type selector invents report kinds the backend does not have.
- Own header says "do not build shells", then ships a preview tab bar and a Quick Find modal; neither belongs in the app (the app palette is navigation-only by invariant).

## 6. UI/UX gate results

- Repo gates on `pages/hr`: control-audit, surface-audit, table-header-audit, modal-audit report no HR file (the only strict failures are in `components/calendar`, unrelated and already uncommitted work). PASS for HR.
- Measured: H-3 overflow (906 vs 727 at 1440px); no document-level horizontal scroll (`scrollWidth` equals viewport).
- Unmeasured (needs a browser gate run before fixes): 280px, axe, contrast, focus order, target size, light theme. Mockup contrast not measured either.

## 7. Centralization candidates, app-wide

| ID | Candidate | Why | Reach |
|---|---|---|---|
| C-1 | `SearchableCombobox` (person/option picker built on Radix Popover, with the `controlSurface` tokens) | No searchable picker exists; 67 files import Radix Select, and person pickers repeat: `TeamLeaderSelect`, `UserSelectField`, `MemberSelectField`, `SkillsLeaderFilters`, `ProfileSelector` | HR first, then those |
| C-2 | `ActiveFilterChips` + reset on top of `Chip`/`FilterToolbar` | Active filters are invisible on every filter bar (reports, audit log, leave, team) | Any `FilterToolbar` page |
| C-3 | `BulkAssignConfirmDialog` over `ConfirmDialog` | Bulk writes should name count and target before applying | HR assignment, admin bulk drawers |
| C-4 | `/` focus shortcut inside `SearchField` using the existing key guard (`shouldIgnoreCalendarKey` family) | One implementation, honours the global-key invariant | Every `SearchField` |
| C-5 | Sortable detail table via `DataTable` plus a right-side record panel (`DialogContent side="right"`) | `HRTableShell` is a one-off; the panel pattern already exists in `UserDetailPanel` | HR tables, other read-only report tables |
| C-6 | Shared filter label + icon (`FilterField`) replacing the duplicated uppercase label in `FilterSelect` and `HRReportFilters` | One treatment, no repeated class strings | HR now, other filter panels |

## 8. Deferred, open questions, plan pointer

Deferred: `/hr/leave-requests`, payroll pages, HR dashboard (not in the mockup); light-theme pass; 280px pass; anything in `components/calendar`.
Open questions for the owner: (1) should reports auto-load a default range (cost: 5 queries on visit) or keep manual Generate; (2) does the export backend support a team filter (H-2 is a backend check first); (3) does the report API support an employee-name or department filter (M-8).
Next step: done. See `docs/audits/2026-11-04-hr-mockup-parity-plan.md` (live re-verification, remaining gaps, and what shipped).
