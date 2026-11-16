# Handover plan: standby 24h weekend rejection + backend audit (2026-11-16)

Audit only. No code was changed. HEAD `eca60ae` on `main`.
Every finding below was reproduced against the real API in a throwaway test, unless marked "read only".

## Status (updated 2026-11-16, implementation session)

Done, uncommitted on branch `fix/standby-backend-audit` (Batches A and B together; split into two PRs when committing if wanted):
- F2: `next_working_day` in the simulation module; module passes on a Monday (today).
- F3: `optional_iso_date` (`core/utils/admin_logs.py`) used by the six actions; `apps/standby/test_date_params.py`.
- F6, F7: create serializer needs both times or neither; models raise `ValidationError`; importer shows it as a readable row error. `apps/standby/test_audit_2026_11_16.py`.
- F1: `buildWeeklyPreview` splits at midnight, reset rebuilds from the builder, dialog groups rows by date with a day total. F4: toast shows the server reason per failed day.
- Pay pin: `plugins/payroll/tests/test_standby_midnight_split.py`. Docs: invariants item 63 and a `CLAUDE.md` hot invariant.
- CORRECTION to section 2: the Monday-start week is **12 rows**, not 13 (1 + 4x2 + 2 + 1). The 123h, the 8 dates and the no-overlap rule in the plan are right; the tests pin 12.
- Also done (second session): F5 (R3 ruled: cap untimed hours at 24 per user and day) and Batch C `repair_standby_overlaps` (`--month` required; production scope: 2026-11 only). Verified in the browser with dummy data (12 rows saved, per-day server reasons shown, repair dry run, apply and idempotent re-run).
- Third session: F8 built (edit of a rejected entry resubmits) and R5 built (single new entry splits at midnight). Owner asked for both.
- Fourth session (UI and exports): same-day segments bundle into one row in the Standby tab, Team Overview and Calendar (chips with time ranges, 12px), edit asks which shift (`StandbySegmentPicker`), bundled approve/reject/delete use bulk calls with error toasts, `/standby/logs/export/` CSV and the Excel file (`bundle_standby_days`, also Team/HR export and year-close) give one row per person-day. Production incident: bulk delete sent `{"ids":[]}` because the bundling code used selection keys as list positions; fixed with `selectedRecordIds`. Production dry run of the repair for 2026-11 reported 0 fixable, 0 needing a human (no overlapping November rows).
- Open: the Pending Approvals queue is not bundled (one row per shift); a report that "standby does not show on pending" in production could not be reproduced locally (create, split, pending list and bulk delete all pass on dummy data).
- NOT done (old text, now superseded): F8 (R4), single-form split (R5), Batch C repair command (own branch after B merges), production rollout (section 10, owner present). The untracked probe `apps/standby/test_tmp_audit_repro.py` could not be deleted by the session (delete was denied); remove it by hand before committing.

## 0. Before you start

- Branch off `main` first (one branch per batch, e.g. `fix/standby-weekend-overlap`). Never commit to `main`.
- Delete `apps/standby/test_tmp_audit_repro.py`. It is an untracked probe left by the audit (the delete was not permitted in the audit session). It passes, but it prints and must not be committed.
- Read first: `docs/workflow-invariants.md` items 26, 62-63; `.devin/context/06-DOMAIN-INVARIANTS.md`; `core/utils/time_overlap.py`.
- Use `py -3.14` for Django commands. TDD: failing test first for every fix.
- Baseline today: 4691 tests, 77 errors, all from finding F2 (one test module). Everything else passes. On a Wednesday-Sunday run the baseline is 4691 green.

## 1. Findings

| ID | Severity | What | Where |
|---|---|---|---|
| F1 | HIGH | Weekly standby generator: Saturday 24h entry is refused (400 overlap) | `frontend/src/pages/standby/hooks/useStandbyForm.ts`, `core/utils/time_overlap.py`, `apps/standby/viewsets.py` |
| F2 | HIGH (CI) | Test module fails every Monday and Tuesday | `plugins/engagement/test_mid_month_move_sim_management.py:130-132` |
| F3 | MEDIUM | Six endpoints answer 500 on a malformed date parameter | `apps/standby/viewsets.py`, `apps/overtime/viewsets.py` |
| F4 | MEDIUM | The weekly generator hides the server's reason for a failed day | `frontend/src/hooks/useStandbyQueries.ts:111-137` |
| F5 | MEDIUM | Standby entries without times bypass the overlap rule: two 24h entries on one day are accepted (48h in a day) | `apps/standby/serializers.py:169-188` |
| F6 | LOW | Standby create accepts `start_time` without `end_time` (update refuses it) | `apps/standby/serializers.py:169-188` |
| F7 | LOW | `StandbyLog.save()` raises `ValueError`, which is a 500 for any caller that skips the serializer | `apps/standby/models/core.py:209-212` |
| F8 | LOW, needs ruling | Editing a rejected overtime or standby entry leaves it rejected, so it can never be resubmitted | `apps/standby/viewsets.py:194-224`, `apps/overtime/viewsets.py:303` |

## 2. F1 in detail (the user's report)

Cause, confirmed:
- The weekly generator builds weekdays as 18:00-09:00 (overnight) and weekend days as 00:00-23:59 with `hours: 24`.
- Friday 18:00-09:00 runs until Saturday 09:00. Saturday 00:00-23:59 starts at Saturday 00:00. The two overlap by 9 hours.
- Since 2026-11-10 `find_overlapping_entry` compares absolute datetimes across midnight (item 63), so the Saturday POST gets 400 "Time range overlaps an existing standby entry on <Friday> (18:00:00-09:00:00)".
- Reproduced: a Monday-start week returns 201 for Mon-Fri, 400 for Saturday, 201 for Sunday.
- The preview table still shows 24h for Saturday and Sunday, which is why the user sees them and then loses Saturday.

Sunday: in a clean week Sunday is accepted. It is refused only when an earlier entry runs into it (for example a Saturday entry typed as an overnight range). Ask the user for the exact Sunday error text if it still fails after the fix.

The backend check is correct: the generator asks for 9 hours twice. Do not loosen `find_overlapping_entry`.

Owner ruling (2026-11-16, replaces the open questions R1 and R2): every standby entry stays inside its own calendar day. A night is split at midnight into two rows.
- Start day (for example Monday): 18:00-00:00, 6h.
- Each following weekday: 00:00-09:00 (9h, the end of the previous night) and 18:00-00:00 (6h), two rows on the same date.
- Saturday and Sunday with "weekend 24h" on: one row 00:00-00:00, 24h (not 00:00-23:59).
- Saturday and Sunday with "weekend 24h" off: the same two rows as a weekday.
- The week closes on the next Monday with 00:00-09:00, 9h. So a week spans 8 dates.
- Monday-start example: 13 rows, 6 + 4 x 15 + 24 + 24 + 9 = 123h, and no two rows overlap.

The current generator does not do this: it sends one 18:00-09:00 row per weekday dated on the start day, which is what crosses into Saturday.

Fix (frontend generator, no backend rule change):
1. `buildWeeklyPreview` returns the rows above instead of one row per day. Derive the two segments from the form's start and end times by cutting the overnight range at 00:00 (18:00 and 09:00 are only the defaults); a range that does not cross midnight stays one row.
2. The row key can no longer be the date alone: two rows share a date. Check `WeeklyGeneratorDialog.tsx`, `previewsEqual`, `updatePreviewRow` and `resetPreviewRow` (all index-based) and any `key={date}`.
3. `resetPreviewRow` uses `new Date(dateString)` (UTC parse) while the builder uses `parseLocalDate`; use `parseLocalDate` in both, and have reset rebuild the row from the builder so the two never drift.
4. Hours per row come from `calculateHours`; 00:00-00:00 gives 24.
5. The submit loop in `StandbyPage.tsx` and `createWeeklyMutation` stay as they are (one POST per row, in order).
6. Dialog copy: the preview now lists segments, so say so (for example "Mon 18:00-00:00", "Tue 00:00-09:00"); the total hours line must sum all rows.

Things the split changes, check each:
- Pay: it changes what some nights are paid. Verified in code; see section 8.
- Month edge: a week that starts on the last day of a month puts 00:00-09:00 rows in the next month. `assert_work_date_open` runs per row, so some rows can be refused by a closed period while others save; the per-day error from F4 must make that visible.
- The single-entry form still accepts an overnight range such as 18:00-09:00 on one row. That stays allowed (item 63, one record on its start date) unless the owner says otherwise; ask (R5) whether the single form should also split at midnight. Do not change it without that answer.
- Standby patterns (`StandbyPattern.start_time`/`end_time`) are a separate feature; not touched here.

Old rows saved by the old generator: see section 9 (repair) and section 10 (production).

Tests to write first:
- `useStandbyForm.test.ts`: Monday start with weekend 24h on gives exactly the 13 rows above, 123h, 8 distinct dates, last row is the next Monday 00:00-09:00, and no two rows intersect in absolute time; weekend 24h off gives two rows on Saturday and Sunday; a start day other than Monday (for example Thursday) still gives 24h weekend rows and closes 7 days later with 00:00-09:00; a same-day range (09:00-17:00) gives one row per day and no closing row.
- `WeeklyGeneratorDialog.test.tsx`: editing or resetting the second row of a date does not touch the first.
- `apps/standby/tests.py`: posting the 13 rows in order returns 201 thirteen times; Friday 18:00-09:00 followed by Saturday 00:00-00:00 still returns 400 (the rule stays).

## 3. F2 in detail

`setUp` creates a vacation on `today + 40 days`. 40 mod 7 = 5, so on a Monday the date is a Saturday and on a Tuesday a Sunday; `LeaveRequest.clean` refuses a leave with no business day and all 77 tests of the module error. CI is red for every PR on those two days.

Fix: pick the next working day on or after `today + 40` (reuse `core/utils/working_days.py`), or freeze the clock for the module. Check the same pattern in the sibling simulation modules (search the test tree for `timedelta(days=` next to `LeaveRequest.objects.create`).
Done when: the module passes with the clock patched to a Monday and to a Tuesday.

## 4. F3 to F8 fix sketches

F3. `team_pending` (`date_from`, `date_to`), `team_logs` (`date`) and `admin_logs` (`date`) in both viewsets pass the raw string to `.filter()`; Django raises its own `ValidationError`, which DRF does not convert, so the answer is 500. The `export` actions already validate and return 400 "Enter a valid date (YYYY-MM-DD)". Reuse that same parser in the six actions (one shared helper, not six copies). Test: each of the six URLs with `garbage` returns 400.

F4. The mutation catches each failure and keeps only `err.message`; the toast lists dates only. Show the server text per failed day (reuse whatever `handleApiError` uses to extract the DRF message). Test: a 400 with a message shows that message.

F5. Decide with the owner: either require times on standby create through the API (the UI always sends them; the importer is a separate path and must keep working), or cap the sum of untimed hours per user and day at 24. Recommended: the cap, in the serializer, both create and update, excluding rejected rows. Test: second 24h untimed entry on the same day returns 400.

F6. Copy the "both or neither" check from `StandbyLogUpdateSerializer.validate` into the create serializer. Test: `start_time` alone returns 400.

F7. Raise `django.core.exceptions.ValidationError` instead of `ValueError` in `StandbyLog.save()`, and check the overtime model for the same pattern. Check the callers that catch `ValueError` first (importers, admin) so none of them starts leaking a 500.

F8. Ruling R4: should an owner's edit of a rejected entry return it to pending (with the resubmission notice, item on notification delivery), or must they create a new one? Today it stays rejected in both overtime and standby. Do nothing until ruled.

## 5. Batches

- Batch A (backend): F2 first (unblocks CI), then F3, F6, F7, then F5 after its ruling. No frontend files.
- Batch B (frontend): F1 (ruled 2026-11-16, see section 2), then F4. Run `npx vitest run src/pages/standby src/hooks` and `npx eslint` on touched files.
- Batch C (data repair, section 9): its own branch and PR, after Batch B is merged.
- F8 (R4) and the single-form question (R5) are ruling-gated; do not build them without an answer.
- Order in production: Batch A, Batch B, then Batch C (section 10).

## 6. Verification and docs

- Targeted while iterating: `py -3.14 manage.py test apps.standby apps.overtime plugins.engagement.test_mid_month_move_sim_management`.
- Full pass once at the end: `py -3.14 manage.py makemigrations --check`, `py -3.14 manage.py test`, ruff on changed files, then in `frontend`: `npx tsc --noEmit`, `npx vitest run`, `npm run build`.
- No migration is expected from any fix here.
- Doc sync in the same PR: extend `docs/workflow-invariants.md` item 63 with the generator rule (the weekly generator splits every night at midnight, a 24h day is 00:00-00:00, the week closes on the 8th date with 00:00-09:00, the overlap check is never loosened for it) and name the pinning tests; add one line to the `CLAUDE.md` overtime/standby hot invariant; record the R3-R5 outcomes.

## 7. Not covered

- This pass went deep on standby and its shared overtime paths. Leave, payroll calculation beyond standby, plugins and permissions were not re-audited (the 2026-11-13 and 2026-11-14 audits cover roles and leader movement).
- Nothing was checked in a browser, and production was not inspected: every number in section 9 comes from the local dev database.
- Concurrency: the overlap check is read-then-write with no lock or constraint, so two simultaneous creates can both pass (read only, not reproduced). Low risk with a sequential UI.

## 8. Impact check of the midnight split (what it touches)

Verified by reading the code at HEAD `eca60ae`:

| Area | Finding | Action |
|---|---|---|
| Payroll amount | `plugins/payroll/services/calculator.py` prices a standby row by `date` and `hours` only; times are ignored. `_is_weekend` is Sunday only: Saturday is paid at the weekday rate, and a public holiday is paid at the weekday rate | Money moves, see below |
| Payroll period | A row is selected by `requested_processing_period`, set from its own date on save | The 00:00-09:00 row on the 1st of a month belongs to the new month. Expected; add a test |
| Overlap rule | Unchanged. The 13 rows never intersect | None |
| Monthly lock, closed year | Checked per row on create (`assert_work_date_open`) | A week crossing a closed month saves only the open rows; F4 must show why |
| Engagement SLA | Counts one request per row (`plugins/engagement/services.py`, `REQUEST_TYPES`) | A week is 13 requests instead of 7. Leaders approve more rows; bulk approve already exists. Tell the owner; no code change |
| Notifications | `post_save` on create notifies the leader once per row (`plugins/notifications/signals.py`) | 13 notices per generated week instead of 7. Do not change in this PR; raise it with the owner |
| Control room roster | `is_overnight` is `end <= start` (`dashboard_service.py:330`). 18:00-00:00 and 00:00-00:00 both read as overnight | Cosmetic. Leave it and note it; do not widen this PR |
| Calendar | Coverage and conflicts are leave-based (`lib/calendarCoverage.ts` has no standby input). Standby shows as events | Two pills per person per weekday. Check the month cell at 1280 and 393 wide |
| Exports and reports | `apps/reports/services/export_service.py` writes one line per row with its times | More lines, same totals. No change |
| Analytics, dashboards | Sum `hours` by date | Totals unchanged; 9h per night move to the next day |
| Data import | The `standby_logs` importer writes rows through the ORM | Not affected |

Money effect of the split, per night with the default 18:00-09:00:
- Saturday night to Sunday morning: 9h move from Saturday (weekday rate) to Sunday (weekend rate). With weekend 24h on they are already inside the 24h Sunday row.
- Sunday night to Monday morning: 9h move from Sunday (weekend rate) to Monday (weekday rate).
- Friday night to Saturday morning, and all weekday nights: no rate change.
- A holiday changes nothing (weekday rate), unless it falls on a Sunday.

Owner accepted this pay change on 2026-11-16. HR must still be told before release: Sunday-night pay goes down and Saturday-night pay goes up. Add one payroll test that pins both cases.

Display rule (owner, 2026-11-16): the split is real in the data (two saved rows, because pay follows the date) and is also shown clearly, grouped by day, so two rows never look like a duplicate.
- Weekly generator preview: one block per date with its segments under it (for example "Tue" then "00:00-09:00, 9h" and "18:00-00:00, 6h") and a day total; a 24h day shows one line. Each segment stays editable on its own. Reuse the existing preview table and shared primitives; no new component library.
- Standby list and approval tables: no change, one line per row. Sort by date then start time so the two segments of a day sit together.
- Calendar: keep one pill per row in this PR. If the month cell looks crowded at 1280 or 393 wide, report it with a screenshot instead of redesigning the cell; merging the two pills of one person and day into one is a follow-up, not part of this work.
- Never merge the two rows into one stored record to make the display simpler.
- Tests: the preview test asserts the day grouping and day totals; the UI gates in `CLAUDE.md` (control, surface, table-header audits) must stay green.

Suites that must pass without being edited: `apps.standby`, `apps.overtime`, `plugins.payroll`, `plugins.control_room`, `plugins.engagement`, `plugins.year_close`, `plugins.data_import.test_overtime_standby_import`, and the `core` time-overlap tests. If one of them needs a change to pass, stop and report it: that is a behaviour change this plan did not foresee.

## 9. Repair of old standby rows (Batch C)

Problem: until 2026-11-10 the old generator saved Friday 18:00-09:00 (15h) and Saturday 00:00-23:59 (24h). The 9h after midnight are counted in both rows. The local dev database holds 51 such pairs (459h counted twice, none touching finalized payroll or a closed year), 332 overnight rows in total (2 already paid) and 140 rows ending 23:59. Production numbers are unknown until the dry run.

Deliver one management command, `apps/standby/management/commands/repair_standby_overlaps.py`. Read `plugins/payroll/management/commands/reprice_finalized_payroll.py` first and copy its safety shape.
1. Dry run is the default and writes nothing. It prints and saves a report of every intersecting pair of non-rejected, non-deleted timed rows of one user on the same or neighbouring dates: user, both rows, overlap in hours, status, payroll state, year state.
2. It fixes one shape only, the "tail covered" pair: row A crosses midnight, row B is dated the next day, starts at 00:00 and ends at or after the end of A. Fix: the `end_time` of A becomes 00:00 and its `hours` are recomputed (15 becomes 6). B is not touched. No row is created, deleted or re-dated.
3. It never changes, and lists under "needs a human": a pair where either row has a finalized `PayrollRunEntry` (already paid; HR decides about the overpayment); a row in a closed year (`is_year_closed`, frozen by item 31); any other overlap shape (same-day overlaps, partial covers, B not starting at 00:00).
4. Writing requires `--apply --confirm REPAIR-STANDBY`. Before the first write it saves a JSON backup (pk, old `end_time`, old `hours`, `updated_at`); `--restore <file>` puts the values back and refuses a row that changed since.
5. All writes in one transaction with `select_for_update`. Status, approver, `submitted_at` and processing period are not touched (a system correction is not a resubmission). Set `_skip_notifications = True` so nobody is notified. One audit log row per changed entry (old and new end time and hours, the command name).
6. Idempotent: a second run reports zero fixable pairs.
7. After apply it prints the draft payroll runs that contain a changed row. `_ensure_draft_inputs_current` compares wage and configuration only, not source hours, so a draft built before the repair would finalize the old 15h. Those drafts must be regenerated by an admin ("Regenerate"); the command only lists them.
8. It does not split the other overnight rows (the ones with no overlap) and does not rewrite 23:59 to 00:00. Their hours are right; only the day attribution is old-style. Splitting them would move pay between Sunday and Monday rates and between months, for approved and paid history. Ruling R6 if the owner wants that anyway; the default is no.

Tests first (`apps/standby/test_repair_overlaps.py`): dry run changes nothing; apply trims A to 6h and leaves B; a finalized pair is untouched and reported; a closed-year pair is untouched and reported (`addCleanup(clear_closed_year_cache)`); odd shapes are reported only; no notification is created; an audit row is written; a second apply is a no-op; restore brings back 15h; a wrong confirm text refuses.

After the repair, `find_overlapping_entry` returns nothing for the repaired users, so their old rows can be edited again. Pin that in one test.

## 10. Production rollout (run with the owner, never alone)

Rules: follow `docs/deploy/production-runbook.md` for deploy and rollback. Commands run as `docker compose exec -T backend python manage.py <command>`. No step in this section runs without the owner saying yes to that step in that session.

1. Merge and deploy Batch A and Batch B through the normal PR and CI path. No migration is expected; confirm with `makemigrations --check`.
2. Smoke test with the owner: generate one standby week for a test user, expect 13 saved rows and no failed day, then delete them.
3. Tell HR about the Sunday-night and Saturday-night pay change (section 8) before the first payroll run that includes new-style rows.
4. Merge and deploy Batch C. Deploying the command changes nothing.
5. Take a fresh site backup (or database dump) and confirm it exists and is not empty.
6. Run the dry run. Give the owner the report: fixable pairs, hours to be removed, and the "needs a human" list.
7. Only after the owner approves the numbers: run with `--apply --confirm REPAIR-STANDBY`. Keep the JSON backup file with the site backup, off the application volume.
8. Run the dry run again: expect zero fixable pairs.
9. An admin regenerates each draft payroll run the command listed, then checks one affected payslip by hand (Friday 6h instead of 15h).
10. Paid pairs are not changed by any tool. Hand the list to HR and the owner; any correction is their decision, made in a later payroll run by the normal means.
11. If anything looks wrong after step 7: `--restore <backup file>`, then stop and report. Do not improvise fixes on production data.

Not allowed in production: direct SQL or `.update()` on standby or payroll rows, editing finalized payroll, reopening a closed year for this repair, running the apply step from a scheduled job.
