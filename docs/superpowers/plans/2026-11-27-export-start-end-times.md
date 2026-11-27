# Overtime and standby exports: start/end columns and segment order (2026-11-27, revision 3)

Goal (owner request + screenshot): every export that lists overtime or standby entries shows `Date | Day | Start Time | End Time | Total Hours | Type`, one row per standby segment, and on one date the `18:00-00:00` row comes before the `00:00-09:00` row. Status: built on 2026-11-27 on branch `fix/export-start-end-times`. Step 6 removed the unused client-side CSV path instead of making its props optional.

## Decisions (owner: "you decide, except Extra hours and On Call Service stay")

- D1. Files list one row per standby segment (replaces the 2026-11-16 one-row-per-day rule for files; screens stay one row per person-day).
- D2. Order applies to **standby only**: a morning tail (`start == 00:00`, `end != 00:00`) goes after the other segments of that date. Dates stay as stored (pay follows the date). Overtime sorts by start time. Known and intended: a daytime standby also prints before the `00:00` row.
- D3. Type values stay `Extra hours` / `On Call Service`.
- D4. Columns: the two CSVs follow the screenshot order (they are read by header name); sheets read by position (analytics) only get new columns **appended at the end**.
- D5. Owner removed the calendar CSV from scope (2026-11-27); calendar exports (CSV and `.ics`) stay as they are. Payroll files stay unchanged, so no payroll file lists standby times (only totals).
- Untimed entries (plain hours) have blank times and sort first, set explicitly (`nulls_first`) so SQLite and Postgres agree.

## Inventory

| # | Export | Change |
|---|---|---|
| 1 | OT/standby Excel: HR reports, Team Overview (`apps/reports/services/export_service.py`) | One row per segment, D2 order |
| 2 | Year-close bundles (calls #1) | Follows #1; do not `--retry` a set started before the deploy (it would mix layouts): rebuild it |
| 3 | Standby CSV, used by the Standby page and admin Standby Logs | New columns, one row per record, D2 order |
| 4 | Overtime CSV, used by the Overtime page and admin Overtime Logs | New columns, order by date, user, start |
| 5 | Analytics Excel "Raw Records" and "Client Breakdown" (download, scheduled email, send-now, export jobs) | Append `Day, Start Time, End Time` at the end; order rows by date, user, start |
| - | Calendar CSV and `.ics` (owner: out of scope), page JSON (already has times), payroll files, all aggregate sheets, leave/skills/ticket/audit/wages, import templates | No change |

## Steps (TDD, each test fails first)

1. Standby sort key in `export_service.py` (Python) and the matching `order_by` for the streamed CSV; one parity test feeds the same rows to both.
2. #1: remove `bundle_standby_days` and `start_label`/`end_label`; keep overtime paid-block bundling (item 23).
3. #3: `User, Date, Day, Start Time, End Time, Total Hours, Type, Status, Description, Evidence`. Order `-date, user, <tail>, start, id` (status removed from the sort).
4. #4: `User, Date, Day, Start Time, End Time, Total Hours, Type, Client, Status, Evidence Type, Evidence, Reference Code, Description`. Explicit `order_by` (today it is `-date, -created_at`). An overnight entry stays one row.
5. #5: append the columns, keep existing names and positions; leave rows blank.
6. `HoursLogExportButtons`: `csvHeaders`/`rowMapper` are required but unused for these two pages; make them optional and drop them there.
7. Docs: items 63 (including its "bundle through these helpers" rule, now screens only), 87(v), 21 (the sheet has no Code column today: record the truth, do not add one), both CSV docstrings, the `CLAUDE.md` standby bullet.

## Tests and verification

- Update: `apps/standby/test_export_day_bundle.py`, `apps/reports/test_export_integrity.py` (header names `Hours` -> `Total Hours`; row count = source records), `apps/overtime/tests.py`, `apps/standby/tests.py`, `apps/reports/tests.py`, `test_paid_block_bundling.py`, `apps/reports/test_csv_injection.py`, `apps/overtime/test_export_search.py`, `plugins/payroll/tests/test_export_totals.py`, `apps/users/tests_app/test_mid_month_move_sim_leave_payroll.py`, `plugins/analytics/test_analytics.py`, `HoursLogExportButtons.test.tsx`.
- Full backend and frontend suites, ruff, tsc, build, year-close dress rehearsal.
- Browser, dummy data: download #1, #3, #4 (personal and admin pages), #5; open each and check columns, order and hour totals.

## Notes

- Re-importing a standby CSV through Data Import is not supported (two segments of a date look like duplicates; `User` is a full name). Not a contract today.
- Anyone outside the app who reads the CSVs by column position will see shifted columns.
