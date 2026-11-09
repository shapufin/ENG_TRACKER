# Payroll Banded Overtime Premium Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Price each approved overtime entry per time band (day / evening / night) with additive premiums from the rule set, for runs generated after it ships, without touching any finalized data.

**Architecture:** A rule set gets a `banded` pricing mode plus four premium values and three band-boundary hours; every existing and cloned set stays `category` mode, so the legacy path and its tests are untouched. A new pure module slices an entry's clock span at the band boundaries and prices each slice as `hours x base_rate x (1 + OT + weekend/holiday + band premium)`. `calculate_payroll` branches on the mode; persistence, ledger and exports consume the same breakdown shape with new codes.

**Tech Stack:** Django 6.1.1 / DRF, `Decimal`, `py -3.14`, React + vitest (rule-set editor only).

**Spec:** `payroll_handover.md` (repo root, untracked) + `docs/payroll.md`.

## Handover verification (checked against code 2026-11-09)

Confirmed: classification is per-entry by start hour (`calculator.py:199-288`); amount is `hours x wage/standard_hours x multiplier` (`:454`); Saturday is a weekday (`_is_weekend`, Sunday only); standby is flat and untouched; rule sets and their children are immutable once a run references them (`viewsets.py:534 _ensure_mutable`); the 12 policy cells equal base + OT 25 + weekend/holiday 25 + evening 20 + night 50; worked examples 1 and 2 recompute correctly (1 086.21 and 2 977.01 at wage 70 000/174).

Corrections and gaps the handover does not state:
1. **A draft run pins its rule set** (`payroll_service.py:454, 792`: regenerate reuses `locked_run.rule_set`). Shipping a new set does NOT reprice an existing draft; it is priced only by a run created after. See Task 5.
2. **`clone` copies an explicit field list** (`viewsets.py:703-707`). New rule-set columns not added there silently revert a cloned banded set to legacy pricing. Task 1 covers it.
3. **`resolve_for_date(month_start)`** is used, so the new set's `effective_from` must be a month start, or the month it ships in is priced by the old set.
4. **`docs/payroll.md` section 4 is wrong**: it says weekend standby is Sat-Sun; code and the handover say Sunday only. Fixed in Task 7.
5. **`seed_payroll_rules` deletes and recreates the Boshti set's categories** (`:120`). Never reuse it for the new set; Task 5 adds a separate command that refuses to touch a referenced set.
6. **Timed `OvertimeLog.hours` is rounded UP to whole hours** (`apps/overtime/models/core.py:235`) and `end <= start` means overnight (+1 day). So `entry.hours` can exceed the clock span; slices use pro-rata (handover 6) and `start == end` is a 24 h span.
7. **`entry_details[].category` is not persisted** (only `amount`/`hours` reach `PayrollRunEntry`), so adding slice detail there is safe.
8. `employment_type` threaded into the calculator with no branch is an unused parameter (CLAUDE.md ladder step 6). The plan adds the field only; see Task 6.
9. The `plugins/payroll/migrations` directory is read-denied to this session. Migrations are generated with `makemigrations`, never hand-written.

## Global Constraints

- Backend commands use `py -3.14` only (never bare `python`); Django 6.1.1.
- Premium values come from the rule set, never constants in `calculator.py`. Base rate stays `wage / monthly_standard_hours` (exact `Decimal`, no per-slice rounding; rounding only per line as today).
- Band edges (defaults, rule-set driven): `day = [06:00, 19:00)`, `evening = [19:00, 22:00)`, `night = [22:00, 06:00)` wrapping midnight; a minute belongs to the band of its starting minute.
- Weekend/holiday context = the entry's own work date for the whole entry (Sunday or date in `holiday_dates`); counted once, never doubled.
- FORBIDDEN: any `.update()`, `bulk_update`, raw SQL or script that reprices `PayrollLine`, `PayrollRunEntry`, `PayrollRun`, or paid OT/standby rows. Finalized runs are never touched.
- Do not touch: standby calculation, TL-closure gate, cutoff/lifecycle, the payslip "reference" banner, `seed_payroll_rules`, `OvertimeLog.hours` / paid-block code.
- Never commit unless asked; `git add` explicit paths only. TDD: failing test first in every task.

> **Update 2026-11-09 (owner answered q3):** working hours end at 18:00, so evening starts at **18:00** (day `[06,18)`, evening `[18,22)`, night `[22,06)`). Wherever this plan says 19:00 / `19`, read 18. Implemented via migration `0015_evening_starts_at_18`; examples with 18-20 now use 17-19.

## Blocking owner decisions (answer before Task 5; Tasks 1-4 do not depend on them)

- **q3** evening starts 19:00 (as in the schedule text) or 18:00 (shift end)? Plan encodes 19:00; it is one seed value (`evening_start_hour`).
- **Effective month** of the new set (must be a month start) and whether the current draft month is repriced (drop and recreate that draft).
- q1 (regular-hours premiums, table 1) and q2 (part-time rates) stay OUT of scope; do not implement.

## Review Focus

- Entry with `start == end` (24 h wrap): priced as a full day, all three bands, hours sum to `entry.hours`.
- Overnight entry that ends exactly on 06:00 or 22:00: nothing of the next band; `end < start` wraps.
- Sunday that is also a public holiday: weekend/holiday premium applied once.
- Only one of start/end present: whole entry at the day band with a persisted warning, never guessed bands.
- Carried-over entry (May work date settled in June): uses June's rule set but the May date's weekend/holiday context.

## File Structure

- Create `plugins/payroll/services/overtime_bands.py` - pure slicing/pricing, no Django imports.
- Create `plugins/payroll/tests/test_overtime_bands.py`.
- Modify `plugins/payroll/models.py` (`PayrollRuleSet`), `serializers.py`, `viewsets.py` (clone, version snapshot), `services/calculator.py`, `services/payroll_service.py`, `services/export_service.py`.
- Create `plugins/payroll/management/commands/seed_payroll_banded_rules.py`.
- Modify `frontend/src/plugins/payroll/components/PayrollRuleSetEditorDialog.tsx` (+ its test).
- Modify `docs/payroll.md`, `docs/workflow-invariants.md` (payroll item), add `.devin/tracking/agents-archive-2026-11-09.md` note.

---

### Task 1: Rule-set banded fields (migration, copy paths)

**Files:**
- Modify: `plugins/payroll/models.py:275-308`, `plugins/payroll/serializers.py` (rule-set serializers), `plugins/payroll/viewsets.py:698-739` (clone) and the `version` branch (`~660-690`) and `_rule_set_snapshot`
- Test: `plugins/payroll/tests/test_overtime_bands.py` (rule-set section)

**Interfaces:**
- Produces on `PayrollRuleSet`: `overtime_pricing: CharField(choices category|banded, default 'category')`, `ot_premium`, `weekend_holiday_premium`, `evening_premium`, `night_premium: DecimalField(max_digits=5, decimal_places=2, default 0)`, `evening_start_hour=19`, `night_start_hour=22`, `night_end_hour=6: PositiveSmallIntegerField`.

- [ ] **Step 1: Failing tests** - `test_new_fields_default_to_legacy_category_mode`; `test_clone_copies_banded_fields` (clone a banded set, assert all 8 fields equal); `test_version_update_copies_banded_fields`; `test_banded_set_rejects_unordered_hours` (needs `night_end < evening_start < night_start`, premiums >= 0) via serializer `validate`.
- [ ] **Step 2: Run** `py -3.14 manage.py test plugins.payroll.tests.test_overtime_bands` - expect FAIL (fields missing).
- [ ] **Step 3: Add the 8 fields** to `PayrollRuleSet`; add them to both rule-set serializers and to the `values` dict in `clone`, the `version` copy, and `_rule_set_snapshot`; validate ordering/non-negative in the create serializer.
- [ ] **Step 4:** `py -3.14 manage.py makemigrations payroll` (do not hand-edit), then `py -3.14 manage.py migrate` and `py -3.14 manage.py showmigrations payroll` shows no `[ ]`.
- [ ] **Step 5: Run** the Step 2 command + `py -3.14 manage.py test plugins.payroll` - PASS, existing tests untouched.
- [ ] **Step 6: Commit** (only when asked): `git add plugins/payroll/models.py plugins/payroll/serializers.py plugins/payroll/viewsets.py plugins/payroll/migrations/<new> plugins/payroll/tests/test_overtime_bands.py`.

### Task 2: Pure band slicing and pricing

**Files:**
- Create: `plugins/payroll/services/overtime_bands.py`; Test: `plugins/payroll/tests/test_overtime_bands.py`

**Interfaces:**
- Produces:
  - `@dataclass(frozen=True) OvertimeBandRules(ot_premium, weekend_holiday_premium, evening_premium, night_premium: Decimal; evening_start_hour, night_start_hour, night_end_hour: int)`
  - `@dataclass(frozen=True) BandSlice(code: str, hours: Decimal, multiplier: Decimal)`
  - `BAND_CODES`: `ot_day, ot_evening, ot_night, wh_ot_day, wh_ot_evening, wh_ot_night`
  - `slice_overtime_entry(hours: Decimal, start: time | None, end: time | None, weekend_or_holiday: bool, rules: OvertimeBandRules) -> tuple[list[BandSlice], list[str]]` (warnings out)

- [ ] **Step 1: Failing tests** (all with `rules` = 0.25 / 0.25 / 0.20 / 0.50, 19 / 22 / 6): `test_policy_matrix_12_cells` (tables 2 and 4: weekday day/evening/night = 1.25/1.45/1.75, weekend-holiday = 1.50/1.70/2.00, one entry per cell, asserting `multiplier`); `test_weekday_18_to_20_splits_day_and_evening` (hours 2 -> 1 h at 1.25 + 1 h at 1.45); `test_sunday_20_to_24` (2 h at 1.70 + 2 h at 2.00; end `time(0,0)` wraps); `test_boundaries_belong_to_starting_minute` (06:00-19:00 day only, 19:00-22:00 evening only, 22:00-06:00 night only); `test_start_equals_end_is_24_hours`; `test_pro_rata_paid_share` (18:30-19:30, hours 1 -> 0.5 + 0.5, sum == 1); `test_slice_hours_always_sum_to_entry_hours` (last slice takes the remainder); `test_missing_timestamp_whole_entry_day_band_with_warning` (also only-start-present).
- [ ] **Step 2: Run** `py -3.14 manage.py test plugins.payroll.tests.test_overtime_bands` - FAIL (module missing).
- [ ] **Step 3: Implement** `slice_overtime_entry` as above: minute-walk or boundary-split over `[start, end)` with `end <= start` wrapping +24 h; multiplier = `1 + ot_premium + (weekend_holiday_premium if weekend_or_holiday) + band premium` (day band premium 0); hours distributed `entry_hours * band_minutes / total_minutes`, last non-empty slice = remainder; order day, evening, night; skip empty bands; code prefix `wh_` when weekend_or_holiday.
- [ ] **Step 4: Run** - PASS.
- [ ] **Step 5: Commit** (when asked).

### Task 3: Calculator branch

**Files:**
- Modify: `plugins/payroll/services/calculator.py` (`PayrollCalculationInput` ~81-112, overtime loop `:446-468`, trace `:470`)
- Test: `plugins/payroll/tests/test_calculator.py` (extend)

**Interfaces:**
- Consumes: `OvertimeBandRules`, `slice_overtime_entry` (Task 2).
- Produces: `PayrollCalculationInput.overtime_band_rules: Optional[OvertimeBandRules] = None`. `None` = legacy path, byte-for-byte unchanged.

- [ ] **Step 1: Failing tests** - `test_legacy_when_no_band_rules` (existing expectations unchanged); `test_banded_example_1` (wage 70 000, 174 h, weekday 18-20 -> `overtime_amount` is 2.70 x B before rounding, 1086.21 after rounding at precision 2); `test_banded_example_2_sunday`; `test_banded_holiday_not_doubled_on_sunday`; `test_banded_breakdown_codes_merge_across_entries` (two entries, same code -> one row with summed hours/amount; `multiplier` is the slice factor); `test_banded_entry_details_amount_is_sum_of_slices` and carries `slices`; `test_carried_over_entry_uses_source_date_context` (May Sunday entry in June run still `wh_`).
- [ ] **Step 2: Run** `py -3.14 manage.py test plugins.payroll.tests.test_calculator` - new tests FAIL, old PASS.
- [ ] **Step 3: Implement** the branch: when `overtime_band_rules` is set, per entry `weekend_or_holiday = _is_weekend(date) or date in holiday_dates`; call `slice_overtime_entry`; add each slice `hours x base_hourly_rate x multiplier` to totals and breakdown (merge by code, same as today); `record_entry('overtime', entry, entry_amount, category='banded')` once per entry with the summed amount and an added `'slices'` list of string decimals; extend warnings. Standby code is not touched.
- [ ] **Step 4: Run** the calculator tests + `py -3.14 manage.py test plugins.payroll` - PASS.
- [ ] **Step 5: Commit** (when asked).

### Task 4: Persistence wiring

**Files:**
- Modify: `plugins/payroll/services/payroll_service.py` (`build_calculation_input` ~314-380, next to `_build_overtime_category_inputs` `:83`)
- Test: `plugins/payroll/tests/test_backend_review.py`, `test_generate_finalize_budget.py`

**Interfaces:**
- Produces: `_build_overtime_band_rules(rule_set) -> Optional[OvertimeBandRules]` returning `None` unless `rule_set.overtime_pricing == 'banded'`.

- [ ] **Step 1: Failing tests** - generate a draft run with a banded rule set (3 entries across bands): line `overtime_breakdown['categories']` uses the new codes; `PayrollRunEntry` has exactly ONE row per source entry whose `overtime_amount` equals the sum of slices; finalize succeeds and the frozen amounts equal the draft's; a category-mode run is identical to before.
- [ ] **Step 2: Run** targeted tests - FAIL.
- [ ] **Step 3: Implement** the helper and pass it into `PayrollCalculationInput`; no extra queries (fields live on the already-loaded `rule_set`).
- [ ] **Step 4: Run** `test_generate_finalize_budget` first. Expected: query counts unchanged; if they move, find the cause before touching a ceiling.
- [ ] **Step 5: Commit** (when asked).

### Task 5: Banded rule set seed and rollout path

**Files:**
- Create: `plugins/payroll/management/commands/seed_payroll_banded_rules.py`; Test: `plugins/payroll/tests/test_overtime_bands.py`

**Interfaces:**
- Command: `manage.py seed_payroll_banded_rules --effective-from YYYY-MM-01 [--source-code AL_2026_BOSHTI_REFERENCE]`.

- [ ] **Step 1: Failing tests** - creates a new set cloned from the source (brackets + contributions copied, categories copied for legacy fallback) with `overtime_pricing='banded'`, 0.25/0.25/0.20/0.50, 19/22/6, `validation_status='reference'`, code distinct from the source; rejects a non-month-start date; is idempotent (second run no-ops); never modifies the source set or any set that has runs; raises on an `effective_from` already used by an active set of the same country and tax profile.
- [ ] **Step 2: Run** - FAIL.
- [ ] **Step 3: Implement** via ORM create (no updates to existing rows), in one `transaction.atomic()`.
- [ ] **Step 4: Run** - PASS. Document the draft rule in the command help: an existing draft run keeps its old rule set; to reprice the current draft month use the existing draft delete + create path, nothing special-cased.
- [ ] **Step 5: Commit** (when asked).

### Task 6: Exports, editor UI, employment_type

**Files:**
- Modify: `plugins/payroll/services/export_service.py:20-26`, `frontend/src/plugins/payroll/components/PayrollRuleSetEditorDialog.tsx` (labels `:41-45` + banded fields), its vitest file; `apps/users/models/core.py` (`UserProfile`) + migration; user serializer/form per next step

**Interfaces:**
- `OVERTIME_CATEGORY_LABELS` gains the 6 band codes, e.g. `ot_evening` -> `Overtime — Evening`, `wh_ot_night` -> `Weekend/Holiday Overtime — Night`; the frontend dropdown labels must match exactly.
- `UserProfile.employment_type`: `CharField(choices=[('full_time','Full Time')], default='full_time')`.

- [ ] **Step 1: Failing tests** - backend: a banded line's payslip rows (`_overtime_rows`) show the new labels and `multiplier_pct` 145/170/etc.; a unit test pins label equality between `OVERTIME_CATEGORY_LABELS` and the frontend list (read the TS constant in the test as text). Frontend: editor shows the 7 banded inputs only when mode is `banded`, hidden otherwise, and posts them. Profile: new and existing users are `full_time`; the API refuses another value.
- [ ] **Step 2: Run** `py -3.14 manage.py test plugins.payroll` and `cd frontend; npx vitest run src/plugins/payroll` - FAIL.
- [ ] **Step 3: Implement** labels, editor fields (reuse `Input controlSize`, `FormDialog` conventions; no raw palette, `docs/ui-control-kit.md`), then the profile field. Locate the existing serializer/form that carries profile fields by `find_usages` on `UserProfile.code` handling, and keep `employment_type` OUT of nested employee-visible payloads (same rule as `code`). It is NOT passed to the calculator (no branch exists yet); this is a deliberate deviation from handover section 5 and needs the owner's OK, otherwise it is an unused parameter. Generate its migration with `makemigrations users`; verify `showmigrations users`.
- [ ] **Step 4: Run** the Step 2 commands, plus `npx tsc --noEmit` and `npx eslint src/plugins/payroll` - PASS. Employment type may ship as its own PR (it is independent of Tasks 1-5).
- [ ] **Step 5: Commit** (when asked).

### Task 7: Docs, verification, e2e

- [ ] **Step 1:** Update `docs/payroll.md` sections 2, 4, 6, 15, 16 and its "verified as of" line; correct the standby Saturday sentence in section 4; add the banded invariant (pricing mode, immutability, forward-only, drafts pin their rule set) to `docs/workflow-invariants.md` payroll item; write the session note in `.devin/tracking/agents-archive-2026-11-09.md`.
- [ ] **Step 2: Full pass once:** `py -3.14 manage.py check`; `py -3.14 manage.py makemigrations --check`; `py -3.14 manage.py test` (expect green; report pre-existing failures by name); `python -m ruff check --output-format=concise <changed .py>`; `cd frontend; npx tsc --noEmit; npx vitest run; npm run build`.
- [ ] **Step 3: e2e** (throwaway DB): move `db.e2e.sqlite3` aside; `py -3.14 manage.py prepare_e2e_db --settings=config.settings_e2e`; `seed_e2e_data`; `seed_payroll_rules`; run `seed_payroll_banded_rules`; create dummy users, wage assignments and OT entries (weekday 18-20, Sunday 20-24, holiday 09-13, overnight); generate a draft; check slice numbers equal handover examples; finalize; confirm a later edit of that run is refused. Browser: payslip preview, run detail, rule-set editor in light/dark and at 375 px. If browser tooling is unavailable, say the visual checks are unmeasured.
- [ ] **Step 4: Prod rollout order:** migrations (`RUN_MIGRATIONS=1`) -> seed banded set with agreed month -> verify `showmigrations` and `resolve_for_date` returns the banded set for the target month -> next generated run uses it. No data migration touches finalized rows.

## Risks

| Risk | Mitigation |
|---|---|
| Clone/version drops banded fields | Task 1 tests on both copy paths |
| Current draft month stays on old rates | Task 5 rule + owner decision on the effective month |
| Hours rounded up exceed clock span | Pro-rata + remainder slice; test asserts sum equality |
| Query budget drift | Task 4 runs the budget test first; no new queries by design |
| Label drift backend/frontend | Task 6 text-equality test |

## Self-review

Spec coverage: slicing, 12-cell matrix, examples 1-4 (example 3 = pro-rata test, example 4 = holiday), boundary convention, missing timestamps, midnight/weekend-date rule, rule-set-driven premiums, forward-only rollout, no finalized repricing, labels sync, ledger one-row-per-entry, employment_type, docs, e2e - each maps to a task above. q1/q2 are explicitly out. Types: `OvertimeBandRules`, `BandSlice`, `slice_overtime_entry`, `overtime_band_rules`, `_build_overtime_band_rules` are named identically across Tasks 2-4. Example 4's 23:00-01:00 holiday case is covered by `test_sunday_20_to_24` plus the wrap tests; add its explicit expectation (night minutes at 2.00) to Task 2 if the executor finds the matrix test too coarse.
