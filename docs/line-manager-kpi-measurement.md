# Handover: Line Manager KPI measurement — three code changes

**Status:** implemented 2026-11-21 on `feat/line-manager-kpi-measurement` (plan `docs/superpowers/plans/2026-11-21-line-manager-kpi-measurement.md`; rules now in `docs/workflow-invariants.md` item 91). Brief below kept as written (rev 3). Decisions locked by the KPI
owner (the Line Manager) with their Manager. Supersedes the findings-only
version of this file.

**Who this is for:** the next AI or engineer picking this up. Read §0–§5 before
editing anything. The findings that justify the work are in §8 (appendix) — you
do not need them to implement, only to answer "why".

**No open decisions remain.** Everything an implementer needs is decided below.
The one outstanding item is a production data correction for the frozen
26-person months — out of scope here, recorded in §0.

**Suggested order:** C first (smallest, and it makes a number the Manager can
judge immediately), then A (one constant plus copy), then B (the only item that
needs a migration). A and C share `report_kpis.kpi_rows`, so if you do them in
one pass, change the targets dict once and run the exact-dict test once.

---

## 0. Read this first

Three changes. A and B live in `plugins/tl_scorecard` and its frontend plugin;
C also touches `plugins/engagement`:

| # | Change | Type |
|---|---|---|
| **A** | Manager-sync target accepts **26 (biweekly) or 45 (weekly)** | Small, backend + copy |
| **B** | **Onboarding checkbox** on a 1-on-1, visible in the UI and every export | Medium, full stack |
| **C** | **Overtime decided within 2 working days** — new judged row + one engagement SLA | Small, three files |

**Hard constraint, do not violate:** an HBPR must never see the onboarding flag
or any count derived from it. One-on-ones are invisible to HBPRs through every
door in this codebase. §3.6 lists exactly what that costs you.

**Do not** invent a new meeting type. **Do not** add a new file-upload model.
**Do not** touch frozen months (§5, trap 5).

**Out of scope — the frozen 26-person months (owner decision, 2026-11-21).**
The months scored against a 26-person roster (September and earlier) are wrong
for a 7-person team, and **no code change here fixes that**. The owner will
correct those months directly in production, separately from A/B/C. Reasons to
keep it out of this work:

- The freeze rule is deliberate: a month is final once it freezes, and
  backfilling it would re-open a number people have already been judged on.
- Any backfill would use *today's* roster (`freeze_scorecard_months` reads the
  live links), so a "fix" by re-running the job records 7 people for a
  26-person month — the same error, mirrored.
- It is a data correction on production rows, not a behaviour change, so it
  needs the owner's hand on the data and a record of what was changed — not a
  code path an implementer ships blind.

So: implement A, B and C. Do not attempt a scorecard backfill, do not add a
"team size override" field, and do not special-case a month number. If the
production correction needs a script, it is written and run separately, with the
affected months listed in the PR or change note.

---

## 1. Locked decisions

**D1 — Manager syncs.** Either cadence is acceptable: 26/year (biweekly) or
45/year (weekly). Whichever is met, the leader is on track. Implement the
**floor as 26**; anything at or above 26 is on track, and 45 is shown as the
upper option.

**D2 — Onboarding.** A checkbox on the existing `one_on_one` meeting. It must be
visible in the record list, the record detail, the visualization page, and every
export (XLSX, PDF, both CSVs). It must not be available on `tl_sync` or
`team_meeting`.

**D3 — Not built (decided, do not revisit).** Turnover, female headcount,
certification counts, onboarding *plan approval*, and unauthorized-overtime
pre-approval stay out of this app. They are HRIS data or new product surface.

**D4 — Overtime: 2 working days, one SLA.** The goal says "all overtime approved
within 2 working days of submission". The scorecard had no target at all and
engagement scored 5, so the same action had two answers. Both become **2**.
Standby stays at 5 — the goal covers overtime only, and changing standby would
be an unrequested scope change.

**D5 — Onboarding eligibility is derived from the hire date, never from today.**
`UserProfile.hire_date` already exists (indexed, set at creation, editable
through the user API, and an import column whose aliases include "start date").
A joiner is onboarding-eligible for **14 calendar days** from that date, and the
obligation is owned by **the month the due date falls in**. §3.5 has the full
definition and the reason for each part.

---

## 2. Work item A — Manager sync dual target

### Why

`services.SCORECARD_TARGETS_BY_ROLE['albanian_tl']['tl_sync_per_year'] = 45`
(`plugins/tl_scorecard/services.py`, line ~362) is the single hardcoded target.
`build_scorecard` paces it as `ceil(45 × month / 12)` and the card renders
*"X of 45 YTD · on pace / N needed by now"*
(`frontend/src/plugins/tl_scorecard/components/scorecard/TeamGovernanceSection.tsx`,
lines 123–191). A biweekly leader (26/year) reads "off pace" from month 2
onward, permanently.

### Changes

1. `plugins/tl_scorecard/services.py`
   - `'tl_sync_per_year': 45` → `'tl_sync_per_year': 26`
   - add `'tl_sync_full_year': 45` to the same dict (display only, never paced).

2. `frontend/src/plugins/tl_scorecard/types/tlScorecard.ts`
   - add `tl_sync_full_year?: number` to the targets type.

3. `TeamGovernanceSection.tsx`, the Manager syncs `StatCard`
   - footer: `"Target 26 (biweekly) or 45 (weekly) — either counts"`.
   - keep the YTD pace line, now computed from 26.

4. `plugins/tl_scorecard/serializers.py`
   - the targets dict is served as-is, so no serializer change is needed unless
     the type is validated. Confirm `targets` passes through unchanged.

5. `docs/workflow-invariants.md` lines ~101 and ~104
   - replace "ceil of 45 x month / 12" with "ceil of 26 x month / 12" and record
     that 45 is the weekly option. That section says *"Editing the numbers needs
     an owner ruling"* — this is that ruling, dated 2026-11-21.

6. Tests to update (names, not line numbers — they move)
   - `test_tl_sync_ytd_counts_this_year_up_to_the_month_with_pace`:
     `ceil(26*3/12) == 7`, was 12.
   - `test_build_scorecard_exposes_the_targets_it_is_measured_against`: asserts
     the **exact** targets dict, so it fails first. Add `tl_sync_full_year: 45`
     (and `ot_within_sla_pct: 100.0` from C) and change 45 → 26.
   - `test_targets_follow_the_viewers_role`: its patched PM dict must carry the
     new keys too, or an export raises `KeyError` (§4.3).
   - `test_targets_fall_back_to_the_line_manager_kpi_without_a_mapped_role`:
     45 → 26.

### Acceptance

| Month | `tl_sync_expected_ytd` |
|---|---|
| 1 | 3 |
| 3 | 7 |
| 6 | 13 |
| 12 | 26 |

A leader with 26 syncs by December is on track. 45 is also on track. 25 is not.
The card names both numbers.

---

## 3. Work item B — onboarding checkbox

### 3.1 Model

`plugins/tl_scorecard/models.py`, class `Meeting`:

```python
onboarding_discussed = models.BooleanField(default=False)
```

- Migration: `plugins/tl_scorecard/migrations/0010_meeting_onboarding_discussed.py`
  (run `py -3.14 manage.py makemigrations tl_scorecard`).
- **Do not** add it to `tracked_fields`. Those drive notification change
  detection; a flag toggle must not notify anyone.
- Constraint: the flag is only meaningful on `meeting_type == 'one_on_one'`.
  Enforce in `MeetingSerializer.validate`:

```python
if attrs.get('onboarding_discussed') and meeting_type != 'one_on_one':
    raise serializers.ValidationError(
        {'onboarding_discussed': 'Only a one-on-one meeting can be an onboarding meeting.'})
```

Handle the partial-update case: fall back to `self.instance.meeting_type` when
`meeting_type` is absent from `attrs`.

### 3.2 API

`plugins/tl_scorecard/serializers.py`, `MeetingSerializer.Meta.fields` (line ~197):
add `'onboarding_discussed'`.

This single addition also makes the **server-side CSV** carry the column:
`csv_export.build_records_csv` writes the serializer's own keys.

### 3.3 In-app visual

| Surface | File | Change |
|---|---|---|
| Log/edit form | `frontend/src/plugins/tl_scorecard/components/LogMeetingDialog.tsx` | checkbox, rendered only when `meetingType === "one_on_one"` |
| Record list chip | `components/records/recordKinds.tsx` (meeting config, ~line 152–164) | `typeChip` appends `· Onboarding` when the flag is true |
| Record detail | `components/records/recordDetails.tsx`, `meetingItems` (~line 116) | a `DetailItem`: "Onboarding discussed — Yes/No" |
| Type | `types/tlScorecard.ts` (`Meeting`) | `onboarding_discussed?: boolean` |

`typeChip` feeds three surfaces at once (table, `RecordDetailDialog`, client
CSV). Changing it changes all three — that is intended, but update the tests.

### 3.4 Exports

| Export | File | Change |
|---|---|---|
| XLSX Summary | `excel_export.py` `_build_summary_sheet` | **automatic** once the `kpi_rows` row exists (§3.5) |
| XLSX Trend | `excel_export.py` `_build_trend_sheet` (~line 151 headers) | add a table column `"Onboarding 1-on-1s"` (the percentage, `—` when no joiners) and widen `set_column` to index 6. Table column only — do not add it to the native chart, which plots counts. |
| XLSX Governance | `excel_export.py` `_build_governance_sheet` (~line 229 `sections`) | new section: Employee, Onboarding date, With |
| PDF cover | `pdf_export.py` `_cover` via `kpi_rows` | **automatic** (§3.5) |
| PDF Meetings | `pdf_export.py` `_meetings_section` (~line 59) | add an `'Onboarding 1-on-1s'` series to the existing 1:1 compliance line chart (both are percentages, same `y_max=100`) and a column in the section's data table |
| Server CSV | `csv_export.py` | **automatic** via the serializer field |
| Client CSV | `components/records/recordsCsv.ts` | add to `RECORDS_CSV_COLUMNS` and `recordsToCsv` |
| Visualize | `pages/TLScorecardVisualizationPage.tsx` | a series in the Meeting cadence chart, or its own section |

### 3.5 Metric — what is due, and what was done

Three keys: the two counts and the share between them.

```python
'onboarding_due': <joiners whose 14-day window closed in this month>,
'onboarding_done': <of those, how many have a tagged 1-on-1 on or before the due date>,
'onboarding_pct': <done / due * 100, or None when due == 0>,
```

**Definition (D5), exactly:**

- `start = profile.hire_date or user.date_joined.date()`. `hire_date` first —
  it is the real employment date, it is editable, and the users importer already
  maps "start date" onto it. `date_joined` is only the fallback for a profile
  that never got one; leave accrual already uses the same fallback in
  `apps/leave_management/viewsets.py`.
- `due = start + timedelta(days=ONBOARDING_WINDOW_DAYS)`, with
  `ONBOARDING_WINDOW_DAYS = 14` as a module constant. Calendar days, because an
  onboarding window is stated in calendar days; if the owner ever wants working
  days, it is one constant plus `count_business_days`.
- **The obligation belongs to the month `due` falls in**, not the hire month.
  A hire on the 28th has its due date in the next month, and the hire month
  freezes on day 10 of that same next month — the metric would be frozen before
  the deadline it measures. With the due-date month, the freeze always lands at
  least ~10 days after the deadline.
- Done = at least one `Meeting(meeting_type='one_on_one',
  counterparty=<the joiner>, onboarding_discussed=True, occurred_on <= due)`.
  **Match on the counterparty, not on `organizer=leader`.** The obligation
  belongs to the joiner, so a 1-on-1 the previous leader logged still counts
  after a move; filtering by organizer would invent a miss out of a transfer.
  It cannot be gamed either: the cohort is the leader's own link-only team, so a
  meeting with someone else's joiner is never in this leader's denominator.
- **Cohort = `scope.scoreable_member_ids(leader)`, with no `is_active=True`
  filter.** That helper is link-only (`italian_tl`/`albanian_tl`) and keeps
  deactivated users, so a person who joined and then left still counts —
  otherwise leaving erases the miss. This is the one deliberate difference from
  `one_on_one_compliance_pct`, which takes the same cohort but then removes
  members who were skipped with a reason or on approved leave for the whole
  month (`meeting_compliance_metrics`, `services.py:287–293`). Onboarding has no
  skip concept: a conversation that did not happen is a miss. If the owner ever
  wants leave to excuse it, that is a new ruling, not an implementer's choice.
  Everything else — the leader link decides whose joiner it is, live until the
  month freezes — behaves like every other scorecard metric.
- **Cutover floor:** only count `start >= ONBOARDING_TRACKING_START`, a module
  constant set at release time to the first day of the month the change ships
  (`date(2026, 12, 1)` if it lands for December). Every pre-existing profile was
  backfilled with `hire_date = date_joined`
  (`apps/leave_management/migrations/0002`), which for the original team is the
  app account date, not the real hire date. Without the floor, the first month
  reports the whole company as new joiners. Record the chosen date in the PR.

**Why not "hire date within the last 2 weeks of today"** (the first idea):
anchoring on *today* makes the eligible set shrink every day, so a joiner who
never got an onboarding 1-on-1 silently drops out of the denominator three weeks
later and the miss disappears. Anchoring on the stored hire date makes the
obligation permanent and month-scoped, and the freeze rule then locks it like
every other metric. Automatic eligibility: yes. Automatic forgiveness: no.

Add the three keys to the `meetings` block in `serializers.ScorecardSerializer`.
In `report_kpis.py`, add one entry to the static `TARGETS` dict (it is the same
100% for every role, so it does not belong in `SCORECARD_TARGETS_BY_ROLE` and
does not touch the exact-dict test):

```python
TARGETS = {..., 'onboarding_pct': 100.0}
```

then one row in `kpi_rows`, directly under the 1:1 compliance row:

```python
row('Meetings', 'Onboarding 1-on-1s within 14 days', meetings['onboarding_pct'], 'pct',
    TARGETS['onboarding_pct']),
```

Judge the **percentage**, not the count. A `count` row with `target=due` would
put a moving 3 in the Target column and would read as green at 3/3 while saying
nothing about the other joiners; 100% matches the goal ("100% onboarding
sign-offs") and reuses the existing status bands (100% on track, 80% watch,
below off track). The absolute numbers are not lost: `onboarding_done` and
`onboarding_due` stay in the API payload for the UI card, and the Governance
sheet lists each joiner by name.

`onboarding_pct` is `None` when `due == 0`, so `status_for` returns `—` and both
the Value and Target cells print `—`. A month with no joiners is "not
applicable", never "failed".

**Trend path.** `build_scorecard` is called once per month by
`scorecard_trend`, which passes a shared `TrendWindow`. Give the new helper the
same `window=None` parameter, or a six-month trend runs six extra queries and
the Trend sheet can drift from the Summary. Two reads belong in
`TrendWindow.__init__`:

- `self.hire_dates = {user_id: (hire_date, date_joined)}` for `team_member_ids`
  (one query) — the cohort is otherwise one query per month.
- `self.onboarding_meetings` = the `one_on_one` + `onboarding_discussed=True`
  rows whose `counterparty_id` is in `team_member_ids` and whose `occurred_on`
  is inside the window. **Not** `self.meetings`: that list is filtered
  `organizer=leader`, which the done-rule deliberately does not use. Slice this
  list per month and compare each row's `occurred_on` with its person's due
  date in Python.

### 3.6 HBPR safety — the part most likely to be missed

An HBPR must not see this flag or any aggregate of it. Three things:

1. `viewsets/scorecard.py` `_mask_one_on_one` (line ~144) nulls
   `one_on_one_compliance_pct`, `one_on_one_compliant`, `one_on_one_eligible`
   for a non-owner, non-staff viewer. **Add `onboarding_due`,
   `onboarding_done` and `onboarding_pct` to that list.**
2. `report_kpis.kpi_rows(..., include_leave_overtime=False)` is the HBPR export
   path, and it currently drops only the Leave and Overtime areas — a Meetings
   row would sail straight through into an HBPR PDF/XLSX. Rename the parameter
   to **`include_restricted`** (it has always meant "hide what an HBPR-only
   viewer may not see"), and make the `False` branch also drop the onboarding
   rows. Nine occurrences, all production: three signatures plus one assignment
   and five pass-throughs (`viewsets/scorecard.py:478` computes it and
   `:485`/`:493` pass it on; `excel_export.py:107` and `:330` declare it,
   `:130`/`:349` pass it on; `pdf_export.py:198` declares it, `:209` passes it
   on). No test passes the keyword directly.
3. `viewsets/records.py` already sets
   `hbpr_exclude = ~Q(meeting_type='one_on_one')` on the meeting viewset
   (line ~52), so the record itself is already invisible. Verify, do not
   re-implement.

Run `plugins/tl_scorecard/test_hbpr_invariants.py` — it walks every registered
route as an HBPR and fails on a new leaking door.

---

## 4. Work item C — overtime: "within 2 working days" as a judged number

### 4.1 Why the existing row cannot carry the target

`ot_turnaround_metrics` returns only an **average** of business days
(`avg_turnaround_days`). The goal says *all* overtime is approved within 2
working days. An average of 2.0 hides one row at 10 days behind nine at 0.9.
Judging the average would also need a new "lower is better" branch in
`status_for`, and a wrong branch would print a 10-day turnaround as "On track".

So keep the average as context (no target) and add the number the goal actually
states, mirroring the leave KPI that already does exactly this
(`leave.pct_within_2_days`, `services.leave_sla_metrics`).

### 4.2 `ot_turnaround_metrics` — add the share inside the window

```python
OT_SLA_WORKING_DAYS = 2   # must equal plugins/engagement/sla.py SLA_WORKING_DAYS['overtime']

holidays = global_holiday_dates(
    min(_local_date(r.submitted_at) for r in decided),
    max(_local_date(r.approved_at) for r in decided),
)
decided_days = [_business_days_elapsed(r.submitted_at, r.approved_at, holidays) for r in decided]
within = sum(1 for d in decided_days if d <= OT_SLA_WORKING_DAYS)
return {
    'decided_count': len(decided),
    'avg_turnaround_days': round(sum(decided_days) / len(decided), 1),
    'within_sla': within,
    'pct_within_sla': round(within / len(decided) * 100, 1),
}
```

The empty case returns early before this block, exactly as today
(`{'decided_count': 0, 'avg_turnaround_days': None}` plus the two new keys as
`0`/`None`).

Two details that are not optional:

- **Pass the holiday set.** `_business_days_elapsed` already accepts
  `holidays=frozenset()`; build it the same way `leave_sla_metrics` does
  (`global_holiday_dates(min(submitted), max(approved))`). Without it, "working
  days" means one thing in the leave KPI and another in the overtime KPI, and a
  Friday-to-Monday approval across a Monday holiday is charged a day it did not
  have. This changes `avg_turnaround_days` only for spans that cross a public
  holiday; the existing owner-rule tests use 0–1 day spans and stay green.
- The empty case stays `pct_within_sla = None` (no decided rows → `—`, never
  `0%`), same rule as `pct_within_2_days`.
- **In the trend, reuse the window's holiday set.** When `window` is not `None`,
  pass `window.leave_holidays` (it already runs a year past the window for late
  decisions) instead of calling `global_holiday_dates` again. Otherwise a
  six-month trend costs six holiday reads and the overtime KPI could disagree
  with the leave KPI about the same month.

### 4.3 The KPI row

`plugins/tl_scorecard/services.py`:

- add `OT_SLA_WORKING_DAYS = 2` next to `PROMOTION_TARGET_PCT`;
- add `'ot_within_sla_pct': 100.0` to `SCORECARD_TARGETS_BY_ROLE['albanian_tl']`
  (the live source; a future PM role gets its own entry).

`plugins/tl_scorecard/serializers.py`: add `within_sla` / `pct_within_sla` to
the `overtime` block.

`plugins/tl_scorecard/report_kpis.py`: add `'ot_within_sla_pct': 100.0` to the
`TARGETS` fallback, then a new row **directly under** the turnaround row:

```python
row('Overtime', 'OT decided within 2 working days', scorecard['overtime']['pct_within_sla'],
    'pct', targets.get('ot_within_sla_pct', TARGETS['ot_within_sla_pct'])),
```

Read the target with `.get(...)` and the static fallback, not `targets[...]`: a
role dict that predates this key (the PM dict in
`test_targets_follow_the_viewers_role` is one) would otherwise crash the export
with a `KeyError`. Update that test dict too, so the fallback is a safety net and
not the only path.

Higher-is-better, so the existing `status_for` works unchanged: 100% on track,
90% watch (the standard 80% band, same as 1:1 compliance), 79% or below off
track. Leave the turnaround row exactly as it is (`target=None`, status `—`).

### 4.4 The PDF target sentence

`pdf_export._cover` prints a hardcoded "Targets: …" sentence that lists the
other targets. Add **"overtime within 2 working days"** and **"onboarding 1-on-1s
within 14 days"** to it, or the PDF cover states every target except the two new
ones. The cover tiles are automatic — they render every row that has a target.

### 4.5 Engagement must agree (same commit)

`plugins/engagement/sla.py`:

```python
SLA_WORKING_DAYS = {'overtime': 2, 'standby': 5}
```

Leaving it at 5 while the scorecard judges at 2 is the exact defect D4 removes.
Blast radius, put it in the PR:

- engagement scores change for **live** months, for every leader, not just this
  one. Frozen months keep their stored `TLApprovalMetric` payload, so history
  does not move.
- three places state the old number and all three must change:
  `plugins/engagement/sla.py` line 7 (module docstring),
  `docs/engagement-metrics.md` line 40 ("End of the 5th working day after the
  submission date" → 2nd), and the constant itself.
- `plugins/engagement/test_engagement_sla.py` pins the old rule and **must be
  rewritten, not deleted**:
  - `test_overtime_gets_five_working_days_end_of_day` (line 54) submits on
    Friday 9 Oct and expects Friday 16 Oct. Two working days is **Wednesday
    14 Oct** — rename the test, change the expectation.
  - `test_public_holiday_moves_overtime_deadline_one_working_day` (line 59) adds
    a Monday holiday and expects Monday 19 Oct. With 2 days it becomes
    **Wednesday 14 Oct** as well.
  - `test_standby_uses_the_same_five_day_rule` (line 65) asserts standby's
    deadline **equals** overtime's. That is now false by design: rewrite it to
    assert overtime is 2 days and standby is 5, with a comment saying the KPI
    goal covers overtime only. Do not "fix" it by moving standby to 2 — that
    would change an SLA nobody asked to change.
- standby stays 5. Do not "harmonise" it.
- Add a comment on each constant pointing at the other file. Do **not** import
  across plugins — plugins never import each other, not even in tests. Pin each
  number in its own plugin's suite.

---

## 5. Traps

1. **HBPR leak** — §3.6. The export path is the one that gets forgotten.
2. **Never add `meeting_type='onboarding'`.** It would stop counting toward
   1-on-1 compliance and produce two records for one conversation.
3. **Two CSVs exist.** `csv_export.py` is server-side (whole filtered set,
   serializer keys, automatic). `recordsCsv.ts` is client-side (only the visible
   rows, fixed column list, manual). Update both.
4. **`typeChip` is shared** by the table, the detail dialog and the client CSV.
5. **Frozen months.** A new field on `Meeting` does not change a frozen
   snapshot (`snapshots.py`, freeze at 00:00 on day 10 of M+1). The change is
   forward-only from the month it ships. Do not backfill.
6. **Colour.** Use tone tokens (`bg-tone-<t>-surface`, `text-tone-<t>-text`).
   A `dark:` override is a bug in this codebase.
7. **`kpi_rows` is shared** by the XLSX Summary and the PDF cover. One edit keeps
   both consistent — that is the point of `report_kpis.py`.
8. **Dialog width** comes from `size`, never `max-w-*`. Run
   `node scripts/modal-audit.mjs` if the form changes.
9. **The onboarding deadline must survive the freeze.** Own the obligation by
   the month of the due date (§3.5). Owning it by the hire month freezes the
   metric before the deadline for anyone hired late in the month.
10. **`hire_date` is backfilled with `date_joined` for old accounts.** Without
    `ONBOARDING_TRACKING_START` the first month reports every existing employee
    as a new joiner.
11. **`onboarding_due == 0` is `—`, not `0%`.** A month with no joiners has
    nothing to judge, and `0/0` rendered as `0%` reads like a failure.
12. **Do not judge the overtime average.** The share inside the window is the
    goal ("all"); the average is context. Adding a target to the average row
    needs a lower-is-better status branch that does not exist yet.
13. **Two constants, one number.** `OT_SLA_WORKING_DAYS` and
    `SLA_WORKING_DAYS['overtime']` must both be 2, with a comment on each
    pointing at the other. No cross-plugin import.
14. **Overtime and standby stop sharing a deadline.** An existing test asserts
    they are equal (`test_standby_uses_the_same_five_day_rule`). Rewrite it to
    assert 2 and 5; do not move standby to 2 to keep it green.

---

## 6. Acceptance criteria

**A — Manager syncs**
- [ ] Month 3 shows 7 needed by now; month 12 shows 26.
- [ ] 26 syncs → on track. 45 syncs → on track. 25 → off track.
- [ ] The card names both 26 and 45.
- [ ] `docs/workflow-invariants.md` matches the code.

**B — Onboarding**
- [ ] Checkbox appears only for `one_on_one`; saving persists it.
- [ ] API rejects `onboarding_discussed=true` on `tl_sync` / `team_meeting`.
- [ ] Record list shows a chip; detail dialog shows the value.
- [ ] XLSX: Summary row, Trend column, Governance section.
- [ ] PDF: cover row, Meetings chart series, Meetings table column.
- [ ] Client CSV column; server CSV column.
- [ ] Visualize shows it.
- [ ] HBPR: no flag, no count, in UI, API or any export.
- [ ] A hire on the 28th is measured in the following month, not the hire month.
- [ ] A joiner who left still counts in their due month.
- [ ] A month with no joiners shows `—`, not `0%`.
- [ ] A joiner hired before `ONBOARDING_TRACKING_START` is not counted.

**C — Overtime**
- [ ] `pct_within_sla` is the share of decided rows at or under 2 business days,
      with public holidays excluded.
- [ ] 100% → On track; 90% → Watch; 79% → Off track.
- [ ] No decided rows → `—`, not `0%`.
- [ ] The average row keeps `target=None` and status `—`.
- [ ] Engagement's overtime SLA is 2 and `docs/engagement-metrics.md` says so.
- [ ] Standby is still 5 in both places.

**Cross-cutting**
- [ ] `makemigrations --check` clean; migration applied to the dev DB.
- [ ] No `dark:` colour added; tone tokens used.
- [ ] Table header rule respected (no inline `<thead>` styling).

---

## 7. Verification

Backend (always `py -3.14`, never bare `python`):

```powershell
py -3.14 manage.py makemigrations tl_scorecard
py -3.14 manage.py migrate
py -3.14 manage.py check
py -3.14 manage.py test plugins.tl_scorecard plugins.engagement
py -3.14 -m ruff check plugins/tl_scorecard plugins/engagement
```

Frontend:

```powershell
cd frontend
npx vitest run src/plugins/tl_scorecard
npx tsc -b
npx eslint src/plugins/tl_scorecard
npx prettier --check "src/plugins/tl_scorecard/**/*.{ts,tsx}"
node scripts/table-header-audit.mjs
node scripts/modal-audit.mjs
npm run build
```

New tests to write (test first):

| Test | Asserts |
|---|---|
| `test_tl_scorecard.py` | pace is `ceil(26 × month / 12)`; targets expose 26 and 45 |
| `test_tl_scorecard.py` | OT: 2 of 3 within 2 business days → `pct_within_sla == 66.7` |
| `test_tl_scorecard.py` | OT: a public holiday inside the span is not charged |
| `test_tl_scorecard.py` | OT: no decided rows → `pct_within_sla is None` |
| `test_tl_scorecard_hbpr.py` | HBPR payload has `onboarding_due/done/pct is None`; HBPR export has no onboarding row |
| `test_scorecard_export_formats.py` | Summary has both OT rows; the within-2-days row is green at 100% |
| `test_scorecard_export_formats.py` | Summary has the onboarding row; green at 100%, `—` with no joiners; Trend has its column |
| `test_tl_scorecard_actions.py` | serializer rejects the flag on a non-1-on-1 |
| `test_tl_scorecard.py` (onboarding) | a hire on the 28th is owned by the **next** month (due-date month), not the hire month |
| `test_tl_scorecard.py` (onboarding) | a 1-on-1 logged by a previous organizer still counts (no organizer filter) |
| `test_tl_scorecard.py` (onboarding) | a leaver still counts; a pre-cutover hire does not |
| `test_engagement_sla.py` | overtime deadline is 2, standby is 5 (three tests rewritten, §4.5) |
| `test_engagement_sla.py` | the public-holiday test still moves the deadline by one working day |
| `LogMeetingDialog.test.tsx` | checkbox only for `one_on_one` |
| `recordsCsv.test.ts` | the column is present |
| `recordKinds.test.ts` | the chip text |

---

## 8. Appendix — findings behind these decisions

### 8.1 What the app measures today

`build_scorecard()` in `plugins/tl_scorecard/services.py`; targets in
`SCORECARD_TARGETS_BY_ROLE` and `report_kpis.TARGETS`.

| KPI | Field | Target |
|---|---|---|
| Leave decided within 2 business days | `leave.pct_within_2_days` | none |
| Pending leave at month-end | `leave.pending_at_month_end` | 0 |
| OT approval turnaround (days) | `overtime.avg_turnaround_days` | **none** (context only, stays that way) |
| OT decided within 2 working days | `overtime.pct_within_sla` | 100% (after C) |
| 1-on-1 compliance | `meetings.one_on_one_compliance_pct` | 100% |
| Manager syncs | `meetings.tl_sync_count`, `tl_sync_ytd` | 26 (45 accepted) after A |
| Onboarding 1-on-1s within 14 days | `meetings.onboarding_pct` (counts in `onboarding_done` / `onboarding_due`) | 100%, after B |
| Team meetings with HRBP | `meetings.team_meetings_with_hrbp` | none |
| Notes within 24h | `meetings.team_meeting_notes_within_24h` | none |
| Management reviews YTD | `review_deliveries_ytd` | 12/year pro-rata |
| Open idle flags | `idle.open_count` | none |
| Absences unaddressed > 5 working days | `absences.breached_5_day_sla` | 0 |
| PIPs pending HR approval | `pip.pending_approval_count` | 0 |
| Promotion ratio | `promotion.promoted_pct` | 3% |
| Escalation risks | `escalation_count` | 0 |
| EPR stages on time | `epr.stages[].pct_on_time` | 31 Mar / 30 Sep / 31 Dec |
| Members with 5+ EPR goals | `epr.cycles_with_5plus_goals` | none |
| EPR stages with evidence | `epr.stages_with_evidence` | none |
| Junior/senior mix | `seniority` counts | none defined |
| Team engagement | `EngagementSurveyResponse` average | none; hidden below 3 responses |

### 8.2 The 26 → 7 team-size fact

- The 1-on-1 target is one per member per month. At 26 members that is 26
  documented meetings a month.
- Month M freezes at 00:00 on day 10 of M+1 (`METRICS_FREEZE_DAY = 10`,
  `core/utils/metrics_freeze.py`).
- The team changed on **9 November**; October froze on **10 November**, so
  October was scored against **7**, not 26.
- **September and earlier are frozen at 26 permanently.** Do not backfill: a
  backfill uses today's roster and would record 7 people for a 26-person month.
- The owner will correct those frozen months directly in production, separately
  from A/B/C (§0, out of scope).

### 8.3 Not measured, and where it belongs

| Goal | Why not here | Where |
|---|---|---|
| Regretted turnover < 7% | no leaver record | Workday |
| 34% female headcount | no gender field | Workday |
| Certifications | Skills stores proficiency | Workday / new Skills field |
| Onboarding plan approval | module is a client document folder | not built (D3) |
| Unauthorized overtime | no pre-approval concept | rewrite the goal (D3) |
| Psychological safety | climate claim | narrative |
| AI tool / pilots / idea surfaced | no model | EPR evidence or `KPIEvidence` |

### 8.4 AI scripts are already uploadable

`KPIEvidence` (`plugins/ticket_kpi/models.py`) stores one file per person per
month with `evidence_type` (`document`/`certificate`/…), an approval workflow
(pending → approved), and inclusion in year-end reports. `.py`/`.js` are **not**
allowed extensions — upload PDF/DOCX/TXT or a screenshot.

### 8.5 Contradictions still to fix in the goal document (owner's job, not code)

| As written | Rewrite |
|---|---|
| "Zero unauthorized overtime" | "All overtime approved within 2 working days" |
| "0 escalations due to administrative delays" | "0 open escalation risks at month-end" |
| "≥45 TL syncs" and "weekly/biweekly" | "≥26 (biweekly) or ≥45 (weekly)" — now matches A |
| "Balanced junior/senior ratio" | two explicit percentages |
| "Engagement ≥8.5/10" | "≥8.5 where at least 3 responses" |
| "Promotion 3%/year" | "≥1 promotion/year, or 3% where team ≥34" |
| "≥12/12 team meetings" | "≥12/year floor; weekly = 48" |
| "100% onboarding sign-offs" | "every new joiner has an onboarding 1-on-1 within 14 days" — now matches B |
| "Turnover <7%", "34% female" | "contribute to" |
| "1 AI tool by mid-year" | pick 30 September (the EPR mid-year) |

### 8.6 Why `hire_date` and not `date_joined`

`UserProfile.hire_date` exists, is indexed, is set at user creation, is editable
through the user API (`apps/users/viewsets.py`), and is a users-importer column
whose aliases already include "start date". `date_joined` is when the *account*
was created: for anyone imported or created before `hire_date` existed, the
migration wrote `hire_date = date_joined`, so the two are identical and neither
is the real employment date. Using `hire_date` with `date_joined` as a fallback
therefore costs nothing and gives HR one field to correct when it is wrong —
which `date_joined` can never be, because it is not editable.
