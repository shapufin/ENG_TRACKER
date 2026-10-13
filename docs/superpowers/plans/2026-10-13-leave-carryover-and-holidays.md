# Leave Carry-Over, Date-Based Carry Priority, and Holiday-Aware Vacation Days Implementation Plan (v2)

> **For agentic workers:** Implemented natively in this session (user choice). Steps use checkbox (`- [ ]`) syntax for tracking. Changes stay uncommitted on branch `feat/leave-carryover-holidays` until the user asks for a commit (CLAUDE.md: never commit unless asked).

**Goal:** Unused vacation at 31 Dec of year Y carries into year Y+1 automatically. It can be used only on days up to the carry-over expiry (default 31 Mar of Y+1, set by one admin setting). Carry days are used first. Days after expiry come from the current year. Global public holidays never count as vacation.

**Architecture:** A guarded, idempotent rollover creates carry rows for the closed year and freezes that year. One holiday-aware day counter is used by validation, deduction, release, serializers, and reports. Each request snapshots its counted days. Deduction splits a request by date: weekdays up to the carry expiry draw from carry, the rest from the current year.

**Tech Stack:** Django 6.1 + DRF (run with `py -3.14`), SQLite dev DB (migrate after every model change), React + TanStack Query, Vitest.

**Spec:** This plan is its own spec. The Outcome section records the user's requirements (2026-10-13) and the success criteria.

## Outcome

**Who / what after:** An employee with unused vacation at 31 Dec sees it in the new year as carry-over. It is usable until the expiry date in Admin > Global Settings (default 31 Mar). Requests use carry-over for the days up to that date. Later days come from the new year's balance. Booking ahead is allowed. A request for April is charged to the new year's balance, which protects carry-over from being booked far ahead. Global holidays set by HR are shared by every calendar and never count as vacation. An admin changes the expiry rule or pauses carry-over from settings, with no code change.

**Success criteria (checkable):**
1. After the first leave read of a new year, every eligible user has one carry row for the closed year, with no manual step. Reports and balance reads see it immediately.
2. Changing expiry month/day or the carry switch in settings changes existing carry rows' expiry, or stops new rollovers, with no code change. Invalid dates are rejected. Feb 29 clamps to Feb 28 in non-leap years.
3. A request spanning a global holiday is counted without that holiday, identically in validation, deduction, release, serializers, and every leave report. Workspace-only holidays do not reduce vacation.
4. Adding or removing a holiday after a request exists never changes that request's counted days. Approve, reject, cancel, and edit always move the amount that was reserved.
5. A request draws carry-over only for weekdays up to and including the carry expiry, and at most the remaining carry. The rest comes from the current year. Reject, cancel, approve, and edit restore or move both parts exactly.
6. Once a year is closed, its leave cannot change except to settle a pending request. This stops late entries from double-counting carry-over.

## Decisions (confirmed by user, plus defaults)

| # | Decision | Source |
|---|---|---|
| D1 | Rollover runs as a guarded, lazy bulk job triggered by the first leave read of a new year, plus a command for backfill. | Confirmed (native) |
| D2 | Carry priority is **date-based**: carry covers weekdays up to and including `expires_at`, capped at remaining carry. Days after expiry come from the current year. Carry is 0 after expiry. | User: carry priority until 31 Mar, 0 afterwards, post-March bookings use current year |
| D3 | "Global" = `PublicHoliday.calendar IS NULL` (HR-set, shown on every calendar). Workspace-only holidays do not reduce vacation. | User: HR sets global holidays, they are inherited on team calendars |
| D4 | Pending closed-year requests **defer** that user's rollover until they are settled. Retried on the user's next leave read. | Default. The user asked for an explanation (see below). Easy to change. |
| D5 | No carry cap. | User |
| D6 | `carry_over_enabled` switch, default on. | Default |
| D7 | A holiday added later does not change requests that already exist (snapshot). | Default, explained below |
| D8 | Closed years freeze: no new requests, no edits, no deletion of approved leave in a closed year. Pending closed-year requests can still be approved, rejected, or cancelled to settle them. | Review finding (see gaps) |

### D4 explained (plain language)

Example: Ana has 5 days pending for 28 Dec 2026. Nobody decides it before 1 Jan 2027.
- **Option A (implemented):** Her 2026 leftover is not carried yet. It is carried automatically once her pending request is decided. Her carry appears on her next leave read after that. No days are lost, and no days are counted twice.
- **Option B:** Carry the leftover now, minus the 5 pending days. If the request is rejected, those 5 days are lost. That is unfair to her.
- **Option C:** Carry the full leftover now. If the request is approved later, the same 5 days are counted twice. Rejected.

I implemented A. Tell me if you want B.

## Review of v1 (gaps and bugs found, now fixed in this plan)

1. **Carry eligibility used `expires_at >= today`.** Wrong for bookings ahead. Fixed: eligibility is decided per request by its dates (D2).
2. **Late entries double-count carry.** A request for 20 Dec 2026, entered in Jan 2027, would draw from the closed 2026 balance that was already carried. Fixed: D8 freezes closed years.
3. **Deadlock risk.** Freezing pending closed-year requests would stop the deferred user from ever getting carry. Fixed: pending closed-year requests stay settleable.
4. **Missed call sites.** `LeaveRequestCreateSerializer.validate` and `LeaveRequest.clean` also call `count_business_days` for vacation. Added to Task 1.
5. **Trigger coverage.** Rollover must run before the first read in the new year: balance reads, team balances, leave requests, reports, and admin overview. Added to Task 3.
6. **Commit steps conflicted with CLAUDE.md** ("never commit unless asked"). Removed. Changes stay uncommitted.
7. **Existing bug, noted:** `perform_update` validates the new date range before releasing the old pending amount. An edit that fits only after release can be rejected. Left as is; flagged for the user.
8. **Existing limitation, not changed:** a request that crosses 31 Dec is charged entirely to its start year.
9. **Data inconsistency, flagged:** the holiday importer lets `is_global=True` and a workspace be set on the same row. Under D3 that row does not count as global. Flagged for the user.
10. **SQLite and locking:** `select_for_update` is a no-op on SQLite. The concurrency guard is tested through the marker (second call is a no-op), not through threads.
11. **Expiry day inclusive:** carry covers days up to and including `expires_at`.
12. **Lazy trigger cost:** the guard costs one settings read per call. It is a no-op once the marker is current.

## Global Constraints

- TDD: write the failing test, run it, see it fail, implement, run it, see it pass.
- No new packages.
- Migrate the dev DB after each model change: `py -3.14 manage.py makemigrations leave_management`, then `migrate`, then `showmigrations leave_management` must show no `[ ]`.
- Every vacation count uses `count_leave_days` (holiday-aware). `count_business_days` stays Mon-Fri only for non-vacation callers.
- Dates use `timezone.localdate()`.
- Carry rows store `year = closed year Y`. Existing lookups use `year - 1`. Keep that.
- Do not stage unrelated files (the working tree has the uncommitted table work).

## Review Focus (checked against tests)

1. Holiday added after approval, then cancel: release uses the snapshot (Task 1 test).
2. Pending closed-year request at rollover: rollover defers, then carries after settlement (Task 3 test).
3. Expiry 31 Feb or 29 Feb in non-leap year: clamps (Task 2 test).
4. Two rollover calls in the same year: one carry row (Task 3 test).
5. Carry row with NULL expiry: rejected by constraint (Task 3 test).
6. Late request into a closed year: refused (Task 4 test).

---

### Task 1: Holiday-aware vacation day count with a counted-days snapshot

**Files:**
- Modify: `apps/leave_management/models/core.py:19-36` (add `count_leave_days`); `LeaveRequest` (`days_counted`; `days_requested` returns it; `save()` recounts when dates change or the field is empty; `clean()` uses `count_leave_days`).
- Modify: `apps/leave_management/serializers.py:154-161` (`LeaveRequestCreateSerializer.validate` uses `count_leave_days`).
- Modify: `apps/leave_management/viewsets.py:601-646` (approve/reject use the snapshot), `:648-682` (validation), `:721-757` (release uses the snapshot).
- Modify: `apps/reports/viewsets.py:326` and the leave section of `apps/reports/services/export_service.py` (`export_leave_to_excel`); `apps/dashboard/admin_trends.py:_leave_days`.
- Create: `apps/leave_management/migrations/0010_leave_days_counted.py`.
- Test: `apps/leave_management/tests.py` (`LeaveHolidayCountTests`).

**Interfaces:**
- Produces `count_leave_days(start_date, end_date) -> int`: Mon-Fri inclusive, minus distinct dates of `PublicHoliday` rows with `calendar__isnull=True` inside the range. Imports `PublicHoliday` inside the function (avoids an import cycle). Returns 0 for None or an inverted range.
- Produces `LeaveRequest.days_counted: Decimal | None` (`DecimalField(5,1, null=True, blank=True)`). `save()` sets it when it is None or when `start_date`/`end_date` changed. `days_requested` returns `Decimal(days_counted)`, or `count_leave_days(...)` when None.

- [ ] **Step 1: Write the failing tests** (`LeaveHolidayCountTests`)
  - `test_global_holiday_is_not_counted`: Mon 2026-03-09 to Fri 2026-03-13 with a global holiday on Wed 2026-03-11 gives 4.
  - `test_workspace_holiday_does_not_reduce_vacation`: same range with a holiday on a workspace calendar gives 5.
  - `test_counted_days_snapshot_ignores_later_holiday`: create a request for 5 days, add a global holiday inside it, reload. `days_requested` is still 5.
  - `test_cancel_after_holiday_added_restores_exact_amount`: approve (used +5), add holiday, reject. `used_days` returns to its prior value.
  - `test_serializer_and_clean_accept_week_with_only_holiday_on_weekdays` (a range where every weekday is a global holiday is rejected: "must include at least one business day").
- [ ] **Step 2: Run them, see them fail** (`py -3.14 manage.py test apps.leave_management.tests.LeaveHolidayCountTests`). Expected: ImportError on `count_leave_days`.
- [ ] **Step 3: Implement** the function, the field, the `save()` rule, and switch every vacation call site listed above. Approve, reject and release read `days_counted`.
- [x] **Step 4: Migration.** As built, `0010_leave_days_counted` only adds the field. The backfill is the management command `backfill_leave_days_counted` (weekday count, as the balances were moved with it), run once per environment after `migrate`. It uses `update()` so an old request whose days are all holidays now cannot abort it.
- [ ] **Step 5: Run** `py -3.14 manage.py test apps.leave_management apps.reports apps.dashboard.tests.test_admin_overview`. Expected: pass.

---

### Task 2: Settings: carry switch, validated expiry, re-stamp on change

**Files:**
- Modify: `apps/leave_management/models/core.py:39-70` (`GlobalSettings`: `carry_over_enabled` BooleanField default True; `carry_over_applied_year` PositiveSmallIntegerField null).
- Modify: `apps/leave_management/serializers.py` (`GlobalSettingsSerializer.validate`).
- Modify: `apps/leave_management/viewsets.py:287-289` (`GlobalSettingsViewSet.perform_update` re-stamps carry rows inside `transaction.atomic()`).
- Modify: `frontend/src/pages/admin/GlobalSettingsPage.tsx`, `frontend/src/types/index.ts` (GlobalSettings type), `frontend/src/pages/admin/GlobalSettingsPage.test.tsx`.
- Create: `apps/leave_management/services/__init__.py` (empty) and `apps/leave_management/services/carry_over.py` (first function only: `carry_over_expiry_for`).
- Create: `apps/leave_management/migrations/0011_globalsettings_carry_over_applied_year_and_more.py` (as generated by `makemigrations`; Task 3 adds the backfill to it). Name kept as generated, because it is already applied on the dev DB and renaming it would look unapplied.
- Test: `apps/leave_management/tests.py` (`GlobalSettingsCarryOverTests`).

**Interfaces:**
- Produces `carry_over_expiry_for(closed_year: int, month: int, day: int) -> date`: `date(closed_year + 1, month, min(day, last_day_of_month))`.
- Produces `GlobalSettings.carry_over_enabled`, `GlobalSettings.carry_over_applied_year`.

- [ ] **Step 1: Failing tests:** day 31 in February is rejected (400). Feb 29 is accepted and `carry_over_expiry_for(2026, 2, 29) == date(2027, 2, 28)`. A PATCH of expiry re-stamps existing carry rows. Disabling the switch leaves existing rows valid until their expiry.
- [ ] **Step 2: Run, see failures.**
- [ ] **Step 3: Implement** the fields, the validation (day must exist in the month in a leap year), the re-stamp in `perform_update`, and the settings page controls: an on/off switch, an expiry preview ("Carry-over from 2026 expires 31 Mar 2027"), and a note that changes apply to existing carry-over.
- [ ] **Step 4: Run** the backend class and `npx vitest run src/pages/admin/GlobalSettingsPage.test.tsx`. Expected: pass.

---

### Task 3: Year-end rollover service with freeze and guard

**Files:**
- Modify: `apps/leave_management/services/carry_over.py` (add functions below).
- Create: `apps/leave_management/management/commands/apply_leave_carry_over.py` (wrapper, `--date YYYY-MM-DD`).
- Modify (trigger points, all call `apply_year_end_carry_over(timezone.localdate())` first):
  - `apps/leave_management/viewsets.py` `ensure_current_year_balance` (line 59), `LeaveBalanceViewSet.get_queryset` (108), `LeaveBalanceViewSet.user_balance_summary` (176), `LeaveBalanceViewSet.team_balances` (149).
  - `apps/reports` leave balance read near `viewsets.py:326`.
  - `apps/dashboard/admin_overview.py` where it reads `LeaveBalance`.
- Modify: `apps/leave_management/migrations/0011_globalsettings_carry_over_applied_year_and_more.py`: a `RunPython` backfill of NULL `expires_at` on carry rows, placed **before** the `AddConstraint` for `leave_carry_over_requires_expiry`. As generated, 0011 has the constraint and no backfill, so any database with a NULL-expiry carry row would fail on SQLite (table rebuild) and on PostgreSQL. Patch below.
- Test: `apps/leave_management/tests.py` (`CarryOverRolloverTests`).

**Interfaces:**
- Produces `closed_years(today) -> int`: returns `GlobalSettings.carry_over_applied_year - 1` (or None when not yet applied). A year is closed when its number is at or below this value.
- Produces `ensure_carry_over_for_user(user, closed_year: int) -> LeaveBalance | None`: returns None when the switch is off, the user has no closed-year vacation row, the user has a pending closed-year request (defers), or the leftover is 0. Otherwise `get_or_create` on (user, vacation, closed_year, is_carry_over=True).
- Produces `apply_year_end_carry_over(today) -> dict`: returns `{"created", "deferred", "skipped"}`. Does nothing when `carry_over_applied_year >= today.year`. Otherwise, inside a transaction with `select_for_update` on the settings row, loops over users with a closed-year vacation row, calls `ensure_carry_over_for_user`, then sets `carry_over_applied_year = today.year`.
- Leftover formula: `entitled = get_monthly_accrued_days(date(Y, 12, 31))` if `accrual_start_date` is set, else `total_days`. `leftover = max(0, entitled - used_days)`. `pending_days` must be 0 (D4).
- Freeze (D8) is enforced in Task 4.

- [ ] **Step 1: Failing tests:**
  - `test_creates_carry_with_leftover_and_settings_expiry`: total 22, used 12, no pending, applied on 2027-01-02, gives a carry row of 10 expiring 2027-03-31.
  - `test_second_run_same_year_is_noop`.
  - `test_pending_closed_year_request_defers_then_carries_after_settlement`.
  - `test_disabled_switch_creates_nothing`.
  - `test_first_balance_read_of_new_year_triggers_rollover`: `GET user_balance_summary` on 2027-01-02 creates the row.
  - `test_null_expiry_carry_row_rejected`: `IntegrityError`.
  - `test_command_backfill_runs_for_given_date`.
- [ ] **Step 2: Run, see failures.**
- [ ] **Step 3: Implement** the service and the trigger calls. Trigger calls must not change any response shape.
- [ ] **Step 4: Migration** backfill plus constraint. Run `makemigrations --check`.
- [ ] **Step 5: Run** `py -3.14 manage.py test apps.leave_management`. Expected: pass.

---

### Task 4: Date-based carry-first split, closed-year freeze, preview endpoint

**Files:**
- Modify: `apps/leave_management/models/core.py` (`LeaveRequest`: `carry_balance` FK to `LeaveBalance`, nullable, `SET_NULL`; `carry_days` DecimalField default 0).
- Modify: `apps/leave_management/viewsets.py`:
  - `_deduct_balance` (544-578): carry_days = min(carry remaining, count_leave_days(start, min(end, carry.expires_at))) where carry is the closed-year row (year = start.year - 1) with `expires_at >= start_date`. The rest goes to the current row (year = start.year). Store `carry_balance`, `carry_days`, `balance`.
  - `_validate_vacation_request` (648-682): same split. Require carry_available (capped to eligible days) + current_available >= counted days. Keep the message shape and name both sources.
  - `_release_balance` (721-757): release carry part on `carry_balance` and the rest on `balance`.
  - `approve` / `reject` / `perform_approve` / `perform_reject`: move both parts with the same pending/used transitions as today.
  - `perform_create`, `perform_update`, `perform_destroy`: enforce the freeze (D8). A request whose start year is closed is refused for create and update (400, message names the closed year). Destroy and approve/reject of an approved request in a closed year are refused. Pending closed-year requests can be approved, rejected, or cancelled.
  - Add a `@action(detail=False, methods=['post'])` `preview_split`: body `start_date`, `end_date`. Returns `{days_counted, carry_days, current_days, carry_expires_at}`. Uses the same helper as deduction, so there is one source of truth.
- Migration: **none new.** `carry_balance` and `carry_days` were generated into `0011` together with the rest of the carry-over schema, so there is no `0012`.
- Frontend (preview): find the leave request form under `frontend/src/pages/leave_management/` and show the split after the dates are picked, using the preview endpoint. If the form is hard to change, show only the backend's error message.
- Test: `apps/leave_management/tests.py` (`CarryFirstSplitTests`, `ClosedYearFreezeTests`).

**Interfaces:**
- Produces `split_vacation_days(user, start_date, end_date, carry_available) -> (carry_days: Decimal, current_days: Decimal, carry_balance)`: the single split rule, used by validation, deduction, and preview.
- Invariant: `carry_days + current_days == days_counted`.

- [ ] **Step 1: Failing tests:**
  - `test_carry_used_first_then_current`: carry 3, current 10, request 5 weekdays fully before expiry gives carry 3 and current 2.
  - `test_booking_after_expiry_uses_current_only`: request for April 2027 with carry 10 gives carry 0.
  - `test_request_crossing_expiry_splits_by_date`: request 26 Mar to 2 Apr 2027 with expiry 31 Mar gives carry for the weekdays up to 31 Mar only.
  - `test_reject_restores_both_parts`, `test_cancel_restores_both_parts`, `test_edit_dates_releases_then_rededucts`.
  - `test_insufficient_total_rejected_with_split_message`.
  - `test_late_request_into_closed_year_refused`.
  - `test_approved_closed_year_leave_cannot_be_deleted`.
  - `test_pending_closed_year_request_can_be_approved_to_settle`.
  - `test_preview_split_matches_deduction`.
- [ ] **Step 2: Run, see failures.**
- [ ] **Step 3: Implement** the split, the freeze, and the preview endpoint.
- [x] **Step 4: Migration.** Folded into `0011` (see Task 3). Existing rows get `carry_days = 0`, which is today's behaviour.
- [ ] **Step 5: Run** `py -3.14 manage.py test apps.leave_management apps.reports`. Expected: pass.

---

### Task 5: Workflow documentation

**Files:**
- Modify: `docs/workflow-invariants.md` (tracked source of truth): new "Leave carry-over, date-based priority, global holidays, closed-year freeze" section. Update the business-day paragraph to say which counter applies where.
- Modify: `CLAUDE.md` (Hot Invariants): one short bullet pointing at the section.
- Modify: `.devin/context/06-DOMAIN-INVARIANTS.md` (local, gitignored): mirror the section.
- Modify: this plan (mark tasks done).

- [ ] **Step 1: Write** the section: rollover trigger and marker, D4 defer rule, expiry rule and clamping, date-based split, `days_counted` snapshot, global = calendar null, the freeze, the five call paths that now use `count_leave_days`.
- [ ] **Step 2: Verify names exist** with trace `search`: `count_leave_days`, `apply_year_end_carry_over`, `carry_over_expiry_for`, `days_counted`, `carry_days`, `split_vacation_days`, `preview_split`.

---

### Task 6: Full verification (once)

- [ ] `py -3.14 manage.py makemigrations --check`, then `migrate`, then `showmigrations leave_management` (no `[ ]`).
- [ ] `py -3.14 manage.py test` (full backend). Report any failure verbatim.
- [ ] `python -m ruff check --output-format=concise` on changed Python files.
- [ ] `cd frontend && npx tsc --noEmit && npx vitest run && npm run build`.
- [ ] `graphify update .` (AST only).
- [ ] Check each Outcome criterion against a command result and report pass/fail with evidence.

---

## Self-Review (v2)

1. **Coverage:** criteria 1 to 6 map to Tasks 3, 2, 1, 1, 4, 4. Docs in Task 5. Verification in Task 6.
2. **Types:** `count_leave_days`, `days_counted`, `carry_days`, `carry_balance`, `carry_over_expiry_for`, `apply_year_end_carry_over`, `ensure_carry_over_for_user`, `split_vacation_days` are named once and reused with the same signatures.
3. **Review Focus:** all six items have a test.
4. **Commits:** none. The user has not asked for a commit.

