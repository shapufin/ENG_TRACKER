# HR pages vs. `hr-intelligence-&-workforce-portal` mockup — Handover Plan

Date: 2026-11-04 · Branch: `feat/hr-mockup-parity` (off `main` at `e8ec367`)
Status: **Batches A, B (HR part) and C implemented; see §9.** Batch D (site-wide combobox) is its own PR.

> File name: the root `handoverplan.md` already belongs to the payroll/finalization
> workstream (untracked, other worker). This plan is a separate file on purpose.

---

## 1. Verdict: yes, the HR pages were rebuilt from this mockup

The three pages the mockup models already exist and are clearly derived from it:

| Page | Route | Proof |
|---|---|---|
| HR Intelligence & Reports | `/hr/reports` | `frontend/src/pages/hr/HRReportsPage.tsx` + 10 `components/` files |
| Team Leader Assignment | `/hr/team-leaders` | `HRTeamLeaderAssignmentPage.tsx` (same 4 KPI labels as the mockup) |
| Company Holidays | `/hr/calendars` | `HRCalendarsPage.tsx` (same catalog header + Sync with Payroll + Add Holiday) |

Commits that did the work (in order):

- `3a32b75` fix(ui): Manager / Line Manager wording (#226) — matches the mockup's labels.
- `57e2375` feat(hr): export team scope, bulk confirm, SearchableCombobox, reports UX (#236).
- `820ca82` feat(hr): click a leader in the rankings to filter the report (#237).

A tracked audit already exists and drove those commits:
`docs/audits/2026-11-03-hr-surface-vs-mockup-audit.md` (findings H-1..H-9, mockup wins
M-1..M-9, centralization candidates C-1..C-6). This plan re-verifies it live and
supersedes its "Next step" line.

What was **not** adopted, correctly: the mockup's own app shell, preview tab bar and
Quick Find modal. `design.md` §CRITICAL RULE says the host owns the shell; the app already does.

---

## 2. What is already at parity (re-verified in the browser today)

| Mockup behaviour | App today | Status |
|---|---|---|
| Page populates on load, filters apply | `HRReportsPage` calls `refetchAll()` on mount | at parity |
| Filter strip + "Reset All Filters" + removable criteria chips | `ActiveFilterChips` (`components/ui/ActiveFilterChips.tsx`) | at parity |
| Searchable combobox with type-ahead + clear | `SearchableCombobox` via `FilterSelect` / `TeamLeaderSelect` | at parity |
| Sortable personnel table, row drill-down, search | `DataTable` + `HRPersonnelDetailPanel` (`side="right"`) | at parity |
| Click a leader to filter the report | `HRTeamLeaderBarList` / `HRTopLeadersCard` `onSelect` | at parity |
| Bulk assignment with a confirm step | `BulkActionBar` + `ConfirmDialog` | better than mockup |
| Holidays: search, sortable, edit + delete | `HolidayTable` (shared with admin) | at parity |
| Real numbers everywhere | KPI/coverage computed from the API | better than mockup |

Measured today: no document-level horizontal overflow at 1440px or 375px on any of the
four HR pages; zero console errors; the Identity Breakdown and leave tables do not
overflow their containers (the old 906 vs 727 overflow is gone).

---

## 3. Remaining gaps (verified today)

| ID | Page | Issue | Severity | Evidence | Fix sketch |
|---|---|---|---|---|---|
| R-1 | Reports | Trend Snapshot renders one point on an empty grid: `buildTrendData` derives months from the filtered range, and the default range is the current month | MEDIUM | screenshot `app-reports-scroll-2.png`; `trendData.ts:18-20` | Query the trend over a fixed window (e.g. last 6 months ending at `end`) independent of the table filters, or default the range to YTD |
| R-2 | Reports | No Employee Name filter and no Report Type filter; the mockup's "Department" has no domain equivalent (the app has Tech / Team / Workspace) | MEDIUM | `HRReportFilters.tsx` renders 5 controls; no employee/report-type control | Decision needed: add employee search (server `?q` exists?) and map Department→Tech facet; drop Report Type unless the API has kinds |
| R-3 | Reports | Export card stacks 4 full-width buttons, so the 4th insight slot is taller than the 3 StatCards beside it | LOW | `app-reports.png`; `HRReportActionBar.tsx:87-119` | 2×2 grid at `md+`, one column at small width |
| R-4 | Reports | Hours by Team Leader normalises bars to the busiest leader and shows no share of total; mockup prints "x %" | LOW | `HRTeamLeaderBarList.tsx:29,60` | Add `% of total` next to hours; keep max-normalised bars |
| R-5 | Reports | Leave Requests table is hand-rolled (`HRLeaveTable`) while Identity Breakdown is a `DataTable` — no sorting, no paging, no row action | LOW | `HRLeaveTable.tsx:3,34` | Port to `DataTable` with the same columns |
| H-1 | Holidays | Title strip repeats the page title ("Holiday Catalog / Global & Workspace Holidays" under "Company Holidays") | LOW | `app-calendars.png`; prior audit H-9 (half-fixed) | Drop the sub-strip, keep the two buttons in the page header row |
| H-2 | Holidays | No "x of y" counter next to search (mockup has one); `DataTable` only reports "N results" in its footer | LOW | `app-calendars.png` | Show `holidays.length` in the table header row |
| L-1 | Leave Requests | "Period" text is not truncated and runs into the "Days" column at 1440px ("10/12/2026 → 11/12/20262 days") | MEDIUM | `app-leave-requests.png`; cell 161px wide, text ≈200px | `whitespace-nowrap` + `truncate`/`title`, or move Days under Period |
| M-4b | Reports | No quick-sort presets (mockup: Highest Standby / Highest Overtime / Most Leaves / A-Z) | LOW | `HRPersonnelTable.tsx` | Optional: `FilterChipRow` seeding the table sort state |
| M-9 | All | No `/` shortcut to focus the page search field | LOW | `SearchField.tsx` (no key handler) | Add inside `SearchField` only, behind the existing key guard |
| A-1 | Assignment | Tech facet chips read "Infrastructure 4 / Backup 0 / Database 0 / No tech 24"; the mockup's segmented pills read as active state more strongly | LOW | `app-team-leaders.png` | Reuse `Chip`/`FacetRow` pressed styling consistently (verify against `docs/ui-control-kit.md`) |

Not a finding any more (was in the 2026-11-03 audit): empty first visit (H-1), export
ignoring Team (H-2), table overflow (H-3), unsortable tables (H-4), hidden-table search
(H-5), static rankings (H-6), instant bulk write (H-7), no type-ahead (H-8).

---

## 4. What not to copy from the mockup

- Hardcoded palette (`slate-*`, `blue-600`) and 10-11px text — breaks the token and 12px rules.
- Fabricated values ("100% Approved", "Fiscal Audit Verified / Oct 2026", always-Approved
  Compliance column). They would show HR wrong numbers.
- Client-side filtering over an in-memory array — the app is server-scoped and paged, and
  payroll/confidentiality depend on that.
- Clickable `<tr>`/`<th>` with no keyboard path or `aria-sort`; unlabelled chip "×";
  hover-only delete. Use `DataTable` and `RowActions`, which already solve these.
- The preview tab bar, Quick Find modal and its own page shell.

---

## 5. Reusable components: what to promote, and how far

The primitives the mockup advertises mostly already exist in the app:
`StatCard`, `Badge`, `Dialog`, `DateRangePicker` (with presets), `SearchField`, `Chip`,
`FilterChipRow`, `FilterToolbar`, `DataTable`, `BulkActionBar`, `RowActions`.

The two genuinely new ones are built but barely adopted:

| Candidate | Exists | Used today | Promote to | Risk |
|---|---|---|---|---|
| `SearchableCombobox` | yes (`components/ui/`) | `FilterSelect` (HR reports), `TeamLeaderSelect` (HR assignment + admin revoke dialog) | 4 duplicate person pickers: `UserSelectField`, `MemberSelectField`, `ProfileSelector`, `SkillsLeaderFilters`; then long lists in 65 files that import Radix `Select` — only those with >10 or people options | MEDIUM: each swap needs its own tests; do not bulk-replace short fixed lists |
| `ActiveFilterChips` | yes | HR report filters only | Every `FilterToolbar` page that hides applied filters (audit log, teams, leave management) | LOW |
| `FilterField` (label + icon + control) | no | duplicated uppercase label class in `FilterSelect`, `HRReportFilters`, leave filters | one shared wrapper | LOW |
| `/` focus shortcut | no | — | inside `SearchField` only (one implementation, guarded) | LOW: must not fire in dialogs/editors |
| Sortable report table | partial | `DataTable` | `HRLeaveTable`, leave-requests period cell | LOW |

Recommendation: adopt column-by-column, each with its page's test green, never a
codebase-wide sweep. `SearchableCombobox` is the only one with real reach.

---

## 6. Batches

- **Batch A — Reports parity (no backend):** R-1, R-3, R-4, R-5. Tests: `src/pages/hr`.
- **Batch B — Filter model:** R-2 (needs the API answer first), M-9, C-2 adoption in HR,
  C-4 `FilterField`. Tests: `SearchField`, `ActiveFilterChips`, `HRReportFilters`.
- **Batch C — Holidays + leave polish:** H-1, H-2, L-1, A-1.
- **Batch D — Site-wide combobox (separate change, own PR):** 4 person pickers only.

---

## 7. Verification gates (per batch)

- `npx vitest run src/pages/hr` plus the touched `src/components/ui` suites.
- `npx tsc -b`, `npx eslint <touched>`, `npx prettier --check <touched>`.
- `node scripts/table-header-audit.mjs`, `node scripts/modal-audit.mjs`,
  `node scripts/control-audit.mjs --strict`, `node scripts/surface-audit.mjs --strict`.
- `npm run build`.
- Browser pass at 1440 and 375, light and dark, as `e2e_hr`; no document overflow,
  zero console errors. Batch D additionally needs its pages re-checked.

---

## 8. Evidence, limits, open questions

Reproduce: backend `py -3.14 manage.py runserver 8000`; app `cd frontend; npm run dev`
(5173); mockup `node .\node_modules\vite\bin\vite.js --port 3100` inside
`HR-INT~1` (the folder name contains `&`, which breaks `npx` through cmd — use the 8.3
path or call Vite's bin directly). Login `e2e_hr` / `e2e_pass_2026` on the dev DB.
Screenshots: `hr-intelligence-&-workforce-portal/shots/` (mockup + app, 1440px).

Baseline taken today: `npx vitest run src/pages/hr` → 17 files / 73 tests pass;
`py -3.14 manage.py check` → no issues. Not run: the full backend (≈3.8k) and full
frontend (≈3.9k) suites, axe/contrast, keyboard walk-through, dark theme, mockup
contrast. All a11y claims here are code-read only.

Open questions for the owner:

1. R-1: should the Trend Snapshot ignore the table range (fixed 6-month window) or should
   the default range be YTD?
2. R-2: is employee-name filtering available server-side? Is "Department" wanted at all,
   or is Tech the right axis?
3. Batch D: is broad `SearchableCombobox` adoption in scope now, or HR-first only?

---

## 9. Implementation outcome (2026-11-04)

| ID | Result |
|---|---|
| R-1 | Fixed. Trend query uses a fixed 6-month window ending at the selected end date (`trendWindowStart`, `hooks/useHRReportQueries.ts`), independent of the table range. Answers open question 1. |
| R-2 | **Deferred by decision.** `reports/` has no employee or report-type parameter; both tables already search by name client-side, Report Type is the export type, "Department" has no domain equivalent (Tech/Team/Workspace exist). A server filter widens scope handling and was not requested. Answers open question 2. |
| R-3 | **Reverted, wontfix.** A 2x2 grid made the card taller (cells are ~115px wide at 1440px, labels wrap to 3 lines); the single column is the better fit for a 1-of-4 slot. |
| R-4 | Fixed. Hours by Team Leader prints each leader's share of the total. |
| R-5 | Fixed. `HRLeaveTable` is a sortable `DataTable`; `HRTableShell` had no other user and was removed. |
| H-1 | Fixed. Duplicate title strip dropped; buttons right-aligned. |
| H-2 | Fixed. `HolidayTable` shows "Holiday Catalog" with a holiday count (shared with admin). |
| L-1 | Fixed. Period column in admin `LeaveRequestsTable` is 210px (was 150px, text is nowrap). |
| M-4b | Done. Quick-sort chips (A-Z, Highest Overtime, Highest Standby, Most Leaves) order the rows handed to the personnel table. |
| M-9 | Done as opt-in `SearchField slashFocus`, enabled on the HR leave search only (`docs/workflow-invariants.md` item 38b). |
| A-1 | No change. `TechFacetFilter` already uses the shared `Chip`/`FacetRow`, shared with admin Users. |
| Batch D | Out of scope; separate PR. Answers open question 3 (HR-first only). |

Verified: vitest over `src/pages/hr`, `src/pages/admin`, `src/components/ui`, `src/hooks` (186 files, 1120 tests) pass; `tsc -b`, eslint, prettier clean on touched files;
table-header and modal audits pass; `npm run build` passes. Strict control/surface audits report
only pre-existing violations in calendar files (RAW-CONTROL 1, MICRO-TEXT 40), none in touched files.
Browser pass as `e2e_hr` (dark theme): reports page 1440px and 375px with no document overflow, trend request spans 2026-06-01..2026-11-30, quick-sort chips and share percentages render, `/` focuses the leave search, holidays page shows the catalog heading and count, report requests all 200. Not run: light theme, axe, full backend suite (no backend change). Quick-sort ordering is covered by a unit test only (the dev data has equal overtime).
