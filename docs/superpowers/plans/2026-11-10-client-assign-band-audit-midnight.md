# Plan: client assignment scope, banded-OT rule audit, cross-midnight overtime

## Primary goal
Only Line Managers assign clients to their team in Settings; the payroll percentages
the app applies and displays are exactly the company's written schedule; and an
overtime shift over midnight (23:00-01:00) is paid once, correctly, and cannot be
double-booked.

Status: PLAN ONLY. Nothing implemented. Findings below were read from code on 2026-11-10 (main @ 4ecd874); items marked "verify" were not executed.

## Phase 0: Findings (documentation discovery, done)
**How this serves the goal:** it fixes the facts every later phase builds on.

### Item 1 - client assignment (Settings)
- `frontend/src/pages/settings/SettingsPage.tsx:39` `showAssignment = isTeamLeader && !isCRScoped` shows `ClientAssignmentSection` to every TL, Managers (`italian_tl`) included.
- Data: `userService.getMyTeamMembers()` -> `GET users/users/my_team_members/`; save: `assign_member_clients` (`apps/users/viewsets.py` ~211) allows staff, or `profile.is_team_leader` with target in `get_team_member_ids()`. Backend has NO Manager/Line Manager distinction.
- Needs a helper that says "is Line Manager" on the frontend (check `computePermissions.ts` for an `isAlbanianTL`-style flag; do not invent one) and the backend equivalent (`apps/permissions/display_names.py` / role checks).
- DECIDED (owner, 2026-11-10): Managers are removed from the rows a Line Manager sees in the Client Assignment table (option B). Implement by excluding Managers from `members` in `useClientAssignment`/`ClientAssignmentSection`, using the single core helper `italian_tl_user_ids()` semantics (never copy its Q); add a server guard in `assign_member_clients` rejecting a Manager target for a non-staff caller. The card itself stays visible to TLs.

### Item 2/3 - banded overtime vs the written schedule
Code: `plugins/payroll/services/overtime_bands.py`; multiplier = `1 + OT 0.25 + weekend/holiday 0.25 + band (evening 0.20, night 0.50)`; bands day 06-19, evening 19-22, night 22-06. Seed: `seed_payroll_banded_rules`. Saturday is a weekday (`calculator._is_weekend`: Sunday only) - matches "Mon-Sat".

| Written rule | Expected | Code gives | Match |
|---|---|---|---|
| Overtime Mon-Sat 06-19 / 19-22 / 22-06 | 125 / 145 / 175 | 1.25 / 1.45 / 1.75 | yes |
| Weekend/holiday as overtime 06-19 / 19-22 / 22-06 | 150 / 170 / 200 | 1.50 / 1.70 / 2.00 | yes |
| Weekend/holiday regular (non-OT) 06-19 / 19-22 / 22-06 | 125 / 145 / 175 | no path (every logged entry is overtime) | GAP |
| Weekday regular 08-19 / 19-22 / 22-06 | 100 / 120 / 150 | no path (regular hours are not logged) | GAP |

Discrepancies and open questions:
1. Regular-hours rows (100/120/150 and weekend regular 125/145/175) have no data source: payroll prices only overtime logs. Already recorded as owner-pending in `docs/workflow-invariants.md` item 62. Need owner answer: are weekend shifts inside the contract logged as overtime today (then they pay 150/170/200, not 125/145/175)? If yes, that is a pay difference the user must confirm.
2. "Overtime" in the table means beyond 40 h/week or 5 days. The calculator marks EVERY overtime log as overtime and never reads `weekly_contract_hours` (doc item 62e). Fine while users only log true overtime; ask if shifts under 40 h must ever be priced as regular.
3. Day band starts at 06:00 for OT; regular work starts 08:00. 06-08 regular pay is unspecified.
4. Band edges at exactly 19:00 and 22:00 match "from 19:00" semantics (a minute belongs to its starting minute); verify 06:00 edge with a test.
5. Holiday on Saturday: code gives weekend rate via the holiday flag. Confirm that is intended.

Consistency check (verify in phase): `frontend/src/plugins/payroll/components/calculationInfo.ts` computes percents from the rule set (`multiplierPercent`), so it cannot drift from code if rule-set values are right; confirm `docs/payroll.md` §4 and `PayrollCalculationInfoDialog.test.tsx` state the same six numbers and the 19:00 start, and that the modal says regular hours are not priced.

### Item 4 - overtime 23:00 to 01:00 next day
What the app does today (read, not executed):
- It stays ONE record dated the start day. `OvertimeLog.save` and the serializer wrap `end <= start` by +1 day, hours = 2 (rounded up to whole hours; paid-block share may refine it). Cap 24 h per entry.
- Payroll prices it correctly across midnight: `slice_overtime_entry` splits by minute, 23-24 on the start day, 00-01 with the NEXT day's Sunday/holiday flag (`calculator.py` ~454). A Saturday 23:00-01:00 shift therefore pays the Sunday rate after midnight. No record split is needed for pricing.
- `paid_blocks.compute_blocks` wraps overnight spans within the start day. An entry the user instead logs on the next date (00:00-01:00) opens its own block (documented known limit, item 23).
- Gaps found:
  a. Overlap check is same-date only (`core/utils/time_overlap.find_overlapping_entry` filters `date=date`): Mon 23:00-01:00 plus Tue 00:00-01:00 are not detected as overlapping, so the 00-01 hour can be paid twice. Verify with a test first.
  b. Month/year boundary: an Oct 31 23:00-01:00 entry belongs to October by its date; `assert_work_date_open` checks the start date only. Confirm processing-period and MonthlyLock treat it consistently, and a Dec 31 entry vs a closed next year.
  c. Display/exports: confirm lists, Excel/PDF (`_overtime_block_rows`) and `bundle_paid_blocks` show "23:00-01:00" with a "next day" hint and the right hours (item 24b already handles the latest end).
- Recommendation: do NOT split the record; keep one record and fix (a), then verify (b)/(c). Splitting would break paid-block sharing, the 24 h cap, approvals and the single `PayrollRunEntry` per source entry.

## Owner clarification (2026-11-10)
Shifts are Mon-Fri 09:00-18:00, covered by the wage; ALL other work is overtime. So the regular-hours rows (100/120/150, weekend regular) never apply and are not a gap; 06:00-08:00 overtime is 125% (day band) and 18:00-19:00 is also 125%. Saturday overtime = 125/145/175; Sunday/holiday overtime = 150/170/200. Open questions 1-3 above are closed; only point 5 (holiday on Saturday) remains.

## Phase 1: Item 1 - hide Managers from the Line Manager's assignment rows (TDD)
**How this serves the goal:** it is the user's first requested behavior change.
- After the open question is answered. Write failing tests first: backend `assign_member_clients` 403 for a Manager-only TL, 200 for a Line Manager and staff; frontend `SettingsPage.test.tsx` / `ClientAssignmentSection.test.tsx` hide the card for a Manager.
- Copy the existing role-flag pattern from `computePermissions.ts` and `apps/permissions/display_names.py`; no new role concept.
- Guard: never write "Italian TL" in visible text; codes unchanged; do not touch `my_team_members` for other callers.
- Verify: `py -3.14 manage.py test apps.users...` targeted; `npx vitest run src/pages/settings`.

## Phase 2: Items 2-3 - lock the schedule with tests, fix only real gaps
**How this serves the goal:** proves the percentages equal the written rules.
- Add one table-driven test in `plugins/payroll/tests/test_overtime_bands.py` asserting all six OT/weekend-OT multipliers at band edges (06:00, 19:00, 22:00) plus Saturday-as-weekday and Sunday/holiday.
- Add a frontend assertion in `PayrollCalculationInfoDialog.test.tsx`/`calculationInfo` tests for the same six numbers; reconcile `docs/payroll.md` §4 wording.
- Regular-hours rows: no code until the owner answers open questions 1-3; then a separate plan.
- Guard: no change to finalized runs except via `reprice_finalized_payroll`.

## Phase 3: Item 4 - cross-midnight overlap and boundary tests
**How this serves the goal:** a night shift is paid once and cannot be double-booked.
- Failing tests first: (a) Mon 23:00-01:00 then Tue 00:00-01:00 -> overlap error (both create orders, and edit); (b) month-end/year-end entries; (c) export row text.
- Fix: extend `find_overlapping_entry` (and standby, which shares it) to also compare the previous date's overnight entries and the next date's entries; keep rejected-exclusion and `exclude_pk`; call from the same two viewset sites (`apps/overtime/viewsets.py` ~229, ~284) and model save path.
- Guard: no `int()` on hours; no `atomic` around `recalculate_day`; keep standby behavior unchanged unless its test shows the same gap.
- Verify: `py -3.14 manage.py test apps.overtime plugins.payroll apps.reports` targeted, then full suite once.

## Phase 4: Final verification
**How this serves the goal:** evidence that all four items hold together.
- `manage.py check`, `makemigrations --check` (no model change expected), ruff on changed files, `npx tsc --noEmit`, vitest on touched dirs, `node scripts/table-header-audit.mjs` if a table is touched.
- Update `docs/workflow-invariants.md` items 23/62 and `AGENTS.md` for the overlap rule and the Manager/Line Manager assignment rule.
- Work on a fresh branch off main; do not commit unless asked.

## Not now
Pricing of regular (non-overtime) evening/night/weekend hours; `half_time` employment; splitting overnight records; changing finalized payroll (needs the owner's rule answers first).
