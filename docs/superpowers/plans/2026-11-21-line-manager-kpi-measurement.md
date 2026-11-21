# Line Manager KPI Measurement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three TL-scorecard KPI changes (C: overtime within 2 working days, A: Manager syncs 26 or 45, B: onboarding 1-on-1 checkbox), the in-app explanation of every target (the "?"/"!" guides), and pass the Frontend UI/UX gate with a real browser click-through.

**Architecture:** Backend metrics live in `plugins/tl_scorecard/services.py` and flow out through one serializer and one shared `report_kpis.kpi_rows` (XLSX Summary + PDF cover). The engagement SLA constant changes in the same commit as the scorecard overtime target. The frontend adds cards, a records checkbox, and a new `ScorecardGuideDialog` that reads the targets from the scorecard payload, so the guide cannot drift from the numbers it explains.

**Tech Stack:** Django 6.1 + DRF (run with `py -3.14`), React + TypeScript, Vitest, Recharts, openpyxl/xlsxwriter, ReportLab, CloakBrowser for the browser pass.

**Spec:** `docs/line-manager-kpi-measurement.md` (rev 3). Every `§` below points into it. Read §0–§5 before Task 1. This plan adds what the spec leaves out: (1) the UI for the overtime card, onboarding card and Visualize KPI tile; (2) the guide dialogs; (3) the UI/UX gate.

## Global Constraints

- Branch first: `feat/line-manager-kpi-measurement` off a pulled `main`. The working tree has unrelated modified/untracked files (`apps/users/...`, `core/utils/...`, handover `.md`s, `db.e2e.sqlite3.bak-*`). Never `git add -A`; stage only the files each task names.
- Overtime SLA = **2** working days in both `OT_SLA_WORKING_DAYS` (scorecard) and `SLA_WORKING_DAYS['overtime']` (engagement). Each carries a comment that names the other. No cross-plugin import, not even in tests. Standby stays **5**.
- Manager-sync pace floor `tl_sync_per_year = 26`; `tl_sync_full_year = 45` is display-only.
- `ONBOARDING_WINDOW_DAYS = 14` (calendar days). Set `ONBOARDING_TRACKING_START` to the first day of the release month (`date(2026, 12, 1)` unless the release slips), and record the date in the PR.
- HBPR: never sees `onboarding_discussed` or `onboarding_due/done/pct`, in the UI, the API or any export (§3.6).
- No `meeting_type='onboarding'`, no new upload model, no backfill of frozen months, no "team size override" (§0, §5).
- Colours come from tone tokens only. A `dark:` colour is a bug. Dialog width comes from `size`, never `max-w-*`. Every icon-only button needs `aria-label` + `title`. Visible text is at least 12px.
- Visible copy says "Manager" / "Line Manager", never "Italian TL" / "Albanian TL" (invariant item 52).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push or open a PR without the owner's go-ahead.

## Review Focus

1. **A staff viewer opens another leader's scorecard.** The onboarding values arrive masked (`null`) for non-owner, non-staff viewers. The card, the Visualize tile and the guide must show `—`, not `0%` and not crash. The test lives in Task 7.
2. **A PATCH changes `meeting_type` away from `one_on_one` while the stored flag is `true`.** It must be rejected with the same `onboarding_discussed` error unless the same request sets the flag to `false`. Otherwise a `tl_sync` carries the flag into the server CSV. The test lives in Task 4.
3. **A joiner with `hire_date = NULL`.** The joiner falls back to `date_joined.date()`. A joiner whose `hire_date` is later edited into an already frozen month does not change that frozen month. The test lives in Task 5.
4. **An overtime row approved across the New Year with a 1 January holiday.** The holiday set must span both years (`min(submitted)`, `max(approved)`). The test lives in Task 1.
5. **A 320px phone and dark mode.** The Cadence grid now holds 5 cards and the header gains an icon button. Nothing may scroll sideways (`scrollWidth == clientWidth`). The guide dialog scrolls inside `DialogBody`. This is checked in Task 9's browser pass.

---

### Task 0: Branch

- [ ] `git checkout main; git pull; git checkout -b feat/line-manager-kpi-measurement`
- [ ] `py -3.14 manage.py showmigrations tl_scorecard` shows no `[ ]` (dev DB current before Task 4 adds `0010`).

### Task 1: C — overtime share within 2 working days + engagement SLA 2 (one commit)

**Files:**
- Modify: `plugins/tl_scorecard/services.py` (`ot_turnaround_metrics`, `OT_SLA_WORKING_DAYS`, `SCORECARD_TARGETS_BY_ROLE['albanian_tl']`)
- Modify: `plugins/tl_scorecard/serializers.py` (overtime block), `plugins/tl_scorecard/report_kpis.py` (`TARGETS`, row), `plugins/tl_scorecard/pdf_export.py` (`_cover` target sentence)
- Modify: `plugins/engagement/sla.py` (constant + docstring line 7), `docs/engagement-metrics.md` line 40
- Test: `plugins/tl_scorecard/test_tl_scorecard.py`, `plugins/tl_scorecard/test_scorecard_export_formats.py`, `plugins/engagement/test_engagement_sla.py`

**Interfaces:**
- Produces: `scorecard['overtime'] = {decided_count, avg_turnaround_days, within_sla: int, pct_within_sla: float | None}`. Also `targets['ot_within_sla_pct'] = 100.0`. Also the `kpi_rows` row `('Overtime', 'OT decided within 2 working days', pct, 'pct', 100.0)`, placed directly under the turnaround row.

- [ ] **Step 1: Write the failing tests** (`test_tl_scorecard.py`)
  - `test_ot_pct_within_sla_counts_rows_at_or_under_two_business_days`: 3 decided rows at 1, 2 and 3 business days → `within_sla == 2`, `pct_within_sla == 66.7`.
  - `test_ot_sla_does_not_charge_a_public_holiday`: submitted Fri, approved Tue, Monday a global `PublicHoliday` → that row counts as within (1 business day).
  - `test_ot_sla_holiday_set_spans_the_new_year`: submitted 31 Dec, approved 4 Jan, 1 Jan a holiday → elapsed excludes 1 Jan.
  - `test_ot_sla_with_no_decided_rows_is_none`: `pct_within_sla is None`, `within_sla == 0`.
  - Update `test_build_scorecard_exposes_the_targets_it_is_measured_against` (exact dict) and the PM dict in `test_targets_follow_the_viewers_role` to carry `ot_within_sla_pct: 100.0`.
- [ ] **Step 2: Write the failing export test** (`test_scorecard_export_formats.py`) `test_summary_has_ot_within_sla_row`: Summary sheet has both overtime rows. The within row is under the turnaround row and reads `On track` at 100%, `Watch` at 90% and `Off track` at 79%. The turnaround row's target and status stay `—`.
- [ ] **Step 3: Rewrite the engagement tests** (§4.5, rewrite, do not delete). Rename `test_overtime_gets_five_working_days_end_of_day` to `test_overtime_gets_two_working_days_end_of_day`, expecting Wed 14 Oct. The holiday test expects Wed 14 Oct. `test_standby_uses_the_same_five_day_rule` becomes `test_overtime_is_two_days_and_standby_stays_five`, with a comment saying the KPI goal covers overtime only.
- [ ] **Step 4: Run them and confirm they fail.** `py -3.14 manage.py test plugins.tl_scorecard.test_tl_scorecard plugins.tl_scorecard.test_scorecard_export_formats plugins.engagement.test_engagement_sla` → FAIL on the new keys and deadlines.
- [ ] **Step 5: Implement it as §4.2–§4.5 specify.** In the trend path (`window` is not `None`), pass `window.leave_holidays` instead of calling `global_holiday_dates` again. Add "overtime within 2 working days" to the `_cover` "Targets:" sentence. Read the row target with `targets.get('ot_within_sla_pct', TARGETS['ot_within_sla_pct'])`.
- [ ] **Step 6: Run Step 4 again and confirm PASS.** Then run `py -3.14 manage.py test plugins.engagement`: the whole engagement suite must be green, because live-month scores change by design.
- [ ] **Step 7: Commit** `feat(scorecard): judge overtime decided within 2 working days; engagement overtime SLA 2`. The commit body lists the blast radius from §4.5.

### Task 2: C — overview card + engagement Metrics guide copy

**Files:**
- Modify: `frontend/src/plugins/tl_scorecard/types/tlScorecard.ts` (`OvertimeTurnaround`: `within_sla?: number; pct_within_sla?: number | null`; `ScorecardTargets`: `ot_within_sla_pct?: number`)
- Modify: `frontend/src/plugins/tl_scorecard/components/scorecard/ScorecardOverview.tsx` (the "OT approval turnaround" card)
- Modify: `frontend/src/plugins/engagement/components/MetricsGuideDialog.tsx` (Deadlines list)
- Test: `frontend/src/plugins/engagement/components/MetricsGuideDialog.test.tsx`, new `frontend/src/plugins/tl_scorecard/components/scorecard/ScorecardOverview.test.tsx`

**Decided UI:** keep the 4-card grid. Do not add a fifth card; change the existing one:
- label `"Overtime decided within 2 working days"`, value `pct_within_sla` + `%` or `—`;
- icon well, colour and progress bar from `slaWell`/`slaTone`/`slaBar`, the same as the leave card;
- trend: `"{within_sla} of {decided_count} decided in time · average {avg}d"`; with `decided_count === 0`: `"No decisions yet this month"`.

- [ ] **Step 1: Write the failing tests.** In `ScorecardOverview.test.tsx`: renders `66.7%` and `"2 of 3 decided in time · average 1.7d"`; with `pct_within_sla: null` renders `—` and `"No decisions yet this month"`. In `MetricsGuideDialog.test.tsx`: the dialog text contains `"Overtime: end of the 2nd working day after submission."` and `"Standby: end of the 5th working day after submission."`, and does not contain `"Overtime and standby"`.
- [ ] **Step 2:** `cd frontend; npx vitest run src/plugins/tl_scorecard/components/scorecard/ScorecardOverview.test.tsx src/plugins/engagement/components/MetricsGuideDialog.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Replace the one Deadlines `<li>` in `MetricsGuideDialog` with the two exact lines from Step 1.
- [ ] **Step 4:** Run Step 2 again → PASS.
- [ ] **Step 5: Commit** `feat(scorecard): overtime card shows share within 2 working days; engagement guide states 2 and 5`.

### Task 3: A — Manager syncs 26 (biweekly) or 45 (weekly)

**Files:**
- Modify: `plugins/tl_scorecard/services.py` (`tl_sync_per_year: 26`, add `tl_sync_full_year: 45`)
- Modify: `frontend/src/plugins/tl_scorecard/types/tlScorecard.ts` (`ScorecardTargets.tl_sync_full_year?: number`)
- Modify: `frontend/src/plugins/tl_scorecard/components/scorecard/TeamGovernanceSection.tsx` (Manager syncs footer)
- Modify: `docs/workflow-invariants.md` (~lines 101/104, owner ruling dated 2026-11-21), `docs/hbpr-and-scorecard.md` (wherever it says 45 a year)
- Test: `plugins/tl_scorecard/test_tl_scorecard.py`, new `frontend/src/plugins/tl_scorecard/components/scorecard/TeamGovernanceSection.test.tsx`

- [ ] **Step 1: Write the failing tests.** In the backend: the four tests named in §2 step 6, plus `test_tl_sync_pace_by_month` with the table month→expected `1→3, 3→7, 6→13, 12→26`. In the frontend: the footer reads exactly `"Target 26 (biweekly) or 45 (weekly) — either counts"`. With `tl_sync_full_year` absent, it reads `"Annual target 26 · about 2 a month"` (the old fallback line).
- [ ] **Step 2:** `py -3.14 manage.py test plugins.tl_scorecard.test_tl_scorecard` and `npx vitest run src/plugins/tl_scorecard/components/scorecard/TeamGovernanceSection.test.tsx` → FAIL.
- [ ] **Step 3: Implement** §2 changes 1–5. Grep `docs/` for `45` next to "sync" so that no doc still states 45 as the pace.
- [ ] **Step 4:** Run Step 2 again → PASS.
- [ ] **Step 5: Commit** `feat(scorecard): Manager-sync pace floor 26, weekly 45 shown as the upper option`.

### Task 4: B — `Meeting.onboarding_discussed` field, validation, API

**Files:**
- Modify: `plugins/tl_scorecard/models.py` (`Meeting.onboarding_discussed = BooleanField(default=False)`; NOT in `tracked_fields`)
- Create: `plugins/tl_scorecard/migrations/0010_meeting_onboarding_discussed.py` (generated)
- Modify: `plugins/tl_scorecard/serializers.py` (`MeetingSerializer.Meta.fields`, `validate`)
- Test: `plugins/tl_scorecard/test_tl_scorecard_actions.py`, `plugins/site_backup/tests/test_backup_coverage_guard.py` (must stay green)

**Interfaces:** Produces `onboarding_discussed: bool` on every meeting payload and on the server CSV.

- [ ] **Step 1: Write the failing tests.**
  - `test_onboarding_flag_saves_on_a_one_on_one`: POST with `true` → 201, stored `True`.
  - `test_onboarding_flag_rejected_on_tl_sync_and_team_meeting`: 400 with key `onboarding_discussed` and message `"Only a one-on-one meeting can be an onboarding meeting."`.
  - `test_patch_type_away_from_one_on_one_with_flag_set_is_rejected`: stored `one_on_one` + `true`, PATCH `{meeting_type: "tl_sync"}` → 400. PATCH `{meeting_type: "tl_sync", onboarding_discussed: false}` → 200.
  - `test_onboarding_toggle_sends_no_notification`: PATCH that only flips the flag creates no `Notification` row.
- [ ] **Step 2:** `py -3.14 manage.py test plugins.tl_scorecard.test_tl_scorecard_actions` → FAIL.
- [ ] **Step 3: Implement.** `validate` resolves both values from `attrs`, falling back to `self.instance`. Then run `py -3.14 manage.py makemigrations tl_scorecard`, then `py -3.14 manage.py migrate`, and confirm `showmigrations tl_scorecard` has no `[ ]`.
- [ ] **Step 4:** Run Step 2 again, plus `plugins.site_backup` → PASS.
- [ ] **Step 5: Commit** `feat(scorecard): onboarding_discussed flag on one-on-one meetings`.

### Task 5: B — onboarding metric, HBPR masking, `include_restricted`, KPI row

**Files:**
- Modify: `plugins/tl_scorecard/services.py` (constants, `onboarding_metrics(leader, month, window=None) -> dict`, `TrendWindow.__init__` adds `hire_dates` and `onboarding_meetings`, `build_scorecard` merges into `meetings`)
- Modify: `plugins/tl_scorecard/serializers.py` (`ScorecardSerializer` meetings block: the three keys)
- Modify: `plugins/tl_scorecard/viewsets/scorecard.py` (`_mask_one_on_one` list; `include_leave_overtime` → `include_restricted` at :478/:485/:493)
- Modify: `plugins/tl_scorecard/report_kpis.py` (`TARGETS['onboarding_pct'] = 100.0`, row under 1:1 compliance, the `include_restricted=False` branch drops it), `excel_export.py` (:107/:130/:330/:349), `pdf_export.py` (:198/:209)
- Test: `plugins/tl_scorecard/test_tl_scorecard.py`, `test_tl_scorecard_hbpr.py`, `test_hbpr_invariants.py`, `test_scorecard_export_formats.py`

**Interfaces:**
- Produces: `onboarding_metrics(leader, month: date, window: TrendWindow | None = None) -> {'onboarding_due': int, 'onboarding_done': int, 'onboarding_pct': float | None}`. It also produces the module constants `ONBOARDING_WINDOW_DAYS = 14` and `ONBOARDING_TRACKING_START: date`. Each joiner gets `due = (hire_date or date_joined.date()) + 14 days`, owned by the month that `due` falls in. The done rule matches the counterparty (§3.5). Cohort = `scope.scoreable_member_ids(leader)`, with no `is_active` filter.
- Produces: `kpi_rows(..., include_restricted: bool = True)`.

- [ ] **Step 1: Write the failing tests** (`test_tl_scorecard.py`)
  - `test_onboarding_hire_on_28th_is_owned_by_the_due_month`: hired 28 Dec (with the cutover set before it) → `due == 0` for December, `== 1` for January.
  - `test_onboarding_counts_a_one_on_one_logged_by_a_previous_organizer`.
  - `test_onboarding_meeting_after_due_date_is_a_miss`.
  - `test_onboarding_leaver_still_counts` (`is_active=False`).
  - `test_onboarding_pre_cutover_hire_is_not_counted`.
  - `test_onboarding_null_hire_date_falls_back_to_date_joined`.
  - `test_onboarding_no_joiners_pct_is_none`.
  - `test_onboarding_trend_matches_summary_and_adds_no_per_month_queries`: `assertNumQueries` on a 6-month `scorecard_trend` equals the count before the change plus the 2 window reads, and each trend month's three keys equal the single-month `build_scorecard` values.
- [ ] **Step 2: Write the failing HBPR and export tests.**
  - `test_tl_scorecard_hbpr.py::test_hbpr_payload_masks_onboarding`: all three keys are `None`.
  - `test_hbpr_export_has_no_onboarding_row`: neither XLSX nor PDF text contains "Onboarding".
  - `test_scorecard_export_formats.py::test_summary_onboarding_row`: green at 100%, `—` Value and Target with no joiners.
- [ ] **Step 3:** `py -3.14 manage.py test plugins.tl_scorecard` → the new tests FAIL.
- [ ] **Step 4: Implement** §3.5 and §3.6. The rename is mechanical: `grep -rn include_leave_overtime plugins/` must return 0 hits afterwards.
- [ ] **Step 5:** `py -3.14 manage.py test plugins.tl_scorecard` → PASS, including `test_hbpr_invariants`.
- [ ] **Step 6: Commit** `feat(scorecard): onboarding 1-on-1s within 14 days metric, hidden from HBPR`.

### Task 6: B — exports (XLSX Trend/Governance, PDF Meetings, cover sentence)

**Files:** `plugins/tl_scorecard/excel_export.py` (`_build_trend_sheet`, `_build_governance_sheet`), `plugins/tl_scorecard/pdf_export.py` (`_meetings_section`, `_cover` sentence). Test: `test_scorecard_export_formats.py`.

**Interfaces:** Consumes Task 5's `onboarding_metrics`. The Governance section needs one row per due joiner: Employee, Onboarding date (the earliest tagged 1-on-1 on or before the due date, or `—`), With (the organizer's name). Add a `'joiners'` list to the `onboarding_metrics` return for this: `[{user_id, name, due, met_on: date | None, organizer_name: str | None}]`. The serializer does not expose it, and the HBPR export path never reads it.

- [ ] **Step 1: Write the failing tests.** The Trend sheet has an `"Onboarding 1-on-1s"` column and shows `—` for a month with no joiners. The Governance sheet has an Onboarding section that lists one met joiner and one missed joiner, with `—` in Onboarding date for the missed one. The PDF Meetings table has the column. The PDF cover sentence contains `"onboarding 1-on-1s within 14 days"`. The HBPR export has none of these.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement §3.4 rows 2, 3, 5 and the cover sentence. Do not add the column to the native XLSX chart. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(scorecard): onboarding in Trend, Governance and PDF Meetings`.

### Task 7: B — frontend: records checkbox, chip, detail, client CSV, cards, Visualize

**Files:**
- Modify: `types/tlScorecard.ts` (`Meeting.onboarding_discussed?: boolean`; `MeetingCompliance` gets `onboarding_due/done: number | null`, `onboarding_pct: number | null`)
- Modify: `components/LogMeetingDialog.tsx`, `components/records/recordKinds.tsx` (`typeChip`), `components/records/recordDetails.tsx` (`meetingItems`), `components/records/recordsCsv.ts`
- Modify: `components/scorecard/TeamGovernanceSection.tsx` (new card in the Cadence grid, directly after 1-on-1 compliance)
- Modify: `pages/TLScorecardVisualizationPage.tsx` (an `onboarding` series in the 1:1 compliance chart that `:190` feeds, plus a KPI tile in "This month at a glance")
- Test: `LogMeetingDialog.test.tsx`, `recordKinds.test.ts`, `recordsCsv.test.ts`, `TeamGovernanceSection.test.tsx`, `TLScorecardVisualizationPage.test.tsx` (create one if it is missing)

All paths are under `frontend/src/plugins/tl_scorecard/`.

**Decided UI and copy:**
- Checkbox: the shared `Checkbox` + `Label`, text `"Onboarding conversation"`, helper `"Tick when this 1-on-1 covered a new joiner's onboarding (within 14 days of their start date)."`. It renders only while `meetingType === "one_on_one"`. Switching the type away resets it to `false`.
- Chip: `"One-on-one · Onboarding"`. Detail item: label `"Onboarding discussed"`, value `Yes`/`No`. Client CSV column header: `"Onboarding discussed"` (`Yes`/`No`; empty for non-meeting kinds).
- Card: label `"Onboarding 1-on-1s within 14 days"`, icon `UserPlus`, value `onboarding_pct%` or `—`, tones `slaWell`/`slaTone`/`slaBar`. Trend: `"{done} of {due} joiners met · Target: 100%"`; with `due === 0`: `"No joiners due this month"`; when masked (`null`): `"Not shown"` with value `—`. Footer: `"Counted in the month a joiner's 14 days end"`. The Cadence grid becomes `lg:grid-cols-3` with 5 cards (2 rows) rather than an orphan fifth card in a 4-column row.
- Visualize tile: rendered only when `onboarding_pct !== null` (same rule as the 1:1 tile).

- [ ] **Step 1: Write the failing tests** for every copy string above. The checkbox is absent for `tl_sync`/`team_meeting`, and switching the type resets the flag. The card renders `—` + `"Not shown"` for `null` values (Review Focus 1) and `"No joiners due this month"` for `due 0`.
- [ ] **Step 2:** `cd frontend; npx vitest run src/plugins/tl_scorecard` → FAIL.
- [ ] **Step 3: Implement.** Use tone tokens only. `LogMeetingDialog` keeps its `size`. Run `node scripts/modal-audit.mjs` → exit 0.
- [ ] **Step 4:** Run Step 2 again → PASS. `npx tsc --noEmit` and `npx eslint src/plugins/tl_scorecard` are clean.
- [ ] **Step 5: Commit** `feat(scorecard): onboarding checkbox, chip, detail, CSV, card and chart`.

### Task 8: The scorecard "?" guide — "How the scorecard is measured"

**Files:**
- Create: `frontend/src/plugins/tl_scorecard/components/scorecard/ScorecardGuideDialog.tsx` + `.test.tsx`
- Modify: `components/scorecard/TLScorecardHeader.tsx` (optional `targets?: ScorecardTargets` prop; icon button in the actions cluster, before `ExportButton`)
- Modify: `pages/TLScorecardPage.tsx` (pass `targets={scorecardQuery.data?.targets}` to each `TLScorecardHeader`)
- Modify: `docs/hbpr-and-scorecard.md` (one paragraph saying that the guide exists and reads `targets`)

**Interfaces:** `ScorecardGuideDialog({ open, onOpenChange, targets }: { open: boolean; onOpenChange(o: boolean): void; targets: ScorecardTargets })`. It mirrors `MetricsGuideDialog`: `size="md"`, opener focus restore, one `DialogBody` scroll region. The header button is `variant="outline" size="control-icon-sm"`, `aria-label="How the scorecard is measured"` with the same `title`, icon `CircleHelp`, and it renders only when `targets` is present. The page is never shown to an HBPR-only viewer (they are redirected to `/hbpr`), and the guide adds nothing to `HbprWorkspacePage`.

**Fixed copy.** Numbers in `{}` come from `targets`. Everything else is literal.
- Title `"How the scorecard is measured"`. Description `"What each number counts, its target, and when a month becomes final."`
- **Leave**: `"Leave decided within 2 working days: target 100%. Pending leave at month-end: target 0."`
- **Overtime**: `"Overtime decided within 2 working days of submission: target {ot_within_sla_pct}%. The average turnaround is shown for context and is not judged. Standby is not part of this target."`
- **1-on-1s**: `"1-on-1 compliance: target {one_on_one_pct}%. A team member on approved leave for the whole month, or skipped with a reason, is excused."`
- **Onboarding**: `"Onboarding 1-on-1s within 14 days: target 100%. Tick Onboarding conversation on the 1-on-1. A joiner is due 14 calendar days after their start date and counts in the month those 14 days end. A joiner who has left still counts. A month with no joiners shows —."`
- **Manager syncs**: `"{tl_sync_per_year} a year (every two weeks) or {tl_sync_full_year} (weekly): either is on track. The year-to-date pace is checked against {tl_sync_per_year}."` (When `tl_sync_full_year` is missing, drop the parenthesis about weekly.)
- **Management reviews**: `"{reviews_per_year} a year, one a month."` **Promotion rate**: `"target {promotion_pct}%."`
- **Colours and status**: `"On the cards, green is 90% or more, amber 70% to 89%, red below 70%. In the Excel and PDF reports, a value at its target is On track, from 80% of it is Watch, and below that Off track."`
- **Working days**: `"Monday to Friday, excluding public holidays, in Albanian time."`
- **When a month is final**: `"A month's numbers freeze at 00:00 on the 10th of the next month and do not change afterwards."`
- **Privacy**: `"Your HR Business Partner never sees 1-on-1s or onboarding results."`

- [ ] **Step 1: Write the failing tests.** Render with `targets = {tl_sync_per_year: 26, tl_sync_full_year: 45, one_on_one_pct: 100, ot_within_sla_pct: 100, reviews_per_year: 12, promotion_pct: <value>}` → text contains `"26 a year (every two weeks) or 45 (weekly)"`, `"within 2 working days of submission: target 100%"`, `"14 calendar days"` and `"never sees 1-on-1s or onboarding"`. Header tests: with no `targets` there is no button. With `targets`, clicking `getByRole("button", {name: "How the scorecard is measured"})` opens the dialog, Escape closes it, and focus returns to the button.
- [ ] **Step 2:** `npx vitest run src/plugins/tl_scorecard/components/scorecard` → FAIL. **Step 3:** Implement. **Step 4:** → PASS. Run `node scripts/modal-audit.mjs`, `node scripts/control-audit.mjs --strict --exclude=src/plugins/engagement` and `node scripts/surface-audit.mjs --strict --exclude=src/plugins/engagement` → exit 0.
- [ ] **Step 5: Commit** `feat(scorecard): "How the scorecard is measured" guide`.

### Task 9: UI/UX gate + full verification (no merge without it)

Runs once, after Tasks 1–8. It follows `docs/workflow-invariants.md` §Frontend gate and the CLAUDE.md rule "clicked, not just rendered".

- [ ] **Step 1: Full backend pass.** `py -3.14 manage.py makemigrations --check`, then `py -3.14 manage.py test` (it includes the standing simulation gates), then `py -3.14 -m ruff check --output-format=concise plugins/tl_scorecard plugins/engagement` → all green. Record the counts.
- [ ] **Step 2: Full frontend pass.** `cd frontend; npx tsc --noEmit; npx eslint src; npx vitest run; npm run build`, then `node --test scripts/table-header-audit.test.mjs; node scripts/table-header-audit.mjs; node scripts/modal-audit.mjs; node scripts/control-audit.mjs --strict --exclude=src/plugins/engagement; node scripts/surface-audit.mjs --strict --exclude=src/plugins/engagement` → all exit 0.
- [ ] **Step 3: Local review stack.** Follow the Frontend-gate recipe exactly: e2e DB migrated + `prepare_e2e_db`, backend on 8011, frontend on 5173 with `VITE_API_URL=http://localhost:8011/api`. Seed one joiner on the Line Manager's team via the Django shell (`hire_date` inside the window, cutover constant temporarily satisfied by the seed date). Also seed one overtime row decided in 1 working day and one in 4.
- [ ] **Step 4: Click-through as the Line Manager.** (a) Log meeting → type 1-on-1 → tick Onboarding conversation → save. Switch the type to TL sync and confirm the checkbox disappears. (b) Records tab: the chip reads `One-on-one · Onboarding`. Open the record and check that the detail says Yes. Edit it, untick, save, and check that the chip is gone. (c) Overview: the overtime card shows `50%` and `1 of 2 decided in time`. (d) Cadence: the onboarding card shows `100%`. The Manager-syncs footer names 26 and 45. (e) Open the "?" guide, read every section, close it with Escape, and confirm focus returns. (f) Export XLSX and PDF: open both, find the two new Summary rows, the Trend column, the Governance section, and the PDF Meetings column and cover sentence. (g) Records → client CSV download has the `Onboarding discussed` column. (h) Visualize: the onboarding tile and series render. (i) The Engagement page "Metrics guide" says overtime 2 / standby 5.
- [ ] **Step 5: Role isolation in the browser.** Log in as the e2e HBPR user. `/hbpr` shows no onboarding anywhere. The HBPR's scorecard export of that Line Manager has no Onboarding row. `GET /api/plugins/tl_scorecard/scorecard/...` returns the three keys as `null` (check in the network panel). As staff viewing the Line Manager: the values show. The employee's My Records shows no flag.
- [ ] **Step 6: Layout and theme.** At 1440, 768 and 320 px, in light and dark: no sideways scroll (`document.documentElement.scrollWidth === clientWidth`), and the header actions wrap without orphaning the "?" button. The guide dialog scrolls inside its body at 320px. Every network call is 2xx, and the console has zero errors.
- [ ] **Step 7: Evidence.** Save screenshots to the scratchpad, not the repo. Then fill the PR checklist: §6 acceptance boxes ticked one by one, the `ONBOARDING_TRACKING_START` date, the engagement blast radius, `NOT RUN:` for anything skipped. Stop the 8011/5173 servers. Run `graphify update .`.
- [ ] **Step 8: Hand back to the owner** for push/PR approval. Do not push without it.

---

## Self-review notes

- Spec coverage: §2 → Task 3. §3.1–3.2 → Task 4. §3.3 → Task 7. §3.4 → Tasks 5–7. §3.5–3.6 → Task 5. §4 → Tasks 1–2. §6 acceptance → Task 9 Step 7. Additions: the overtime card (Task 2), the onboarding card + Visualize tile (Task 7), both guides (Tasks 2, 8), and the browser gate (Task 9).
- Deviation from the spec, deliberate: Task 6 adds a non-serialized `joiners` list to `onboarding_metrics`. The Governance sheet needs names, and the spec does not say where they come from.
- Known inconsistency surfaced, not fixed: the card colour bands (90/70) and the export status bands (target / 80%) differ. The guide states both truthfully. Unifying them needs an owner ruling.
