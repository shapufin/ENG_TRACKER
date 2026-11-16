# Plan: 1-on-1 cadence + audit follow-ups (2026-11-16)

Source: `docs/audits/one-on-one-cadence-2026-11-16/round-1.md`. One branch per phase, squash to main, no code before rulings R1-R4.

## Rulings (decided 2026-11-16)
R1 skip with a reason is not a miss (leaves the KPI denominator; blank reason counts). R2 slots avoid employee leave and holidays, next slot recalculated automatically. R3 employee sees the next date on My Records. R4 leader's own pending standby stays hidden (item 82 (d)). Phases A to C are built; Phase D docs done.

## Original questions
R1. A skipped 1-on-1 does not count as held. Keep the monthly KPI unchanged (recommended) or exclude skipped employees from the denominator?
R2. Slots avoid employee approved leave as well as public holidays (recommended), or holidays only?
R3. Does the employee see their next 1-on-1 date? Recommend yes, date only; never notes, never to the HBPR.
R4. Leader's own pending overtime/standby: keep hidden (item 82 (d)) or show "Your own" in their queue?

## Phase A: 1-on-1 cadence (backend)
Goal: a Line Manager sets a recurring schedule per employee (or one team default); the app computes due slots; the leader confirms Held or Skip with a reason.
Files: new `OneOnOnePlan` (leader, employee, cadence triple, effective_from/to) and `OneOnOneSkip` (plan, slot date, reason, recorded_by) in `plugins/tl_scorecard/models.py`; shared pure schedule function extracted from `apps/users/models/hbpr.py` (assignment delegates, same tests); service module; viewset; reminders next to `reminders.py`; two notification types with kill-switch.
Steps (TDD, each test first):
1. Extract schedule function; HBPR tests stay green unchanged.
2. Models + migration (lift the migrations deny rule for makemigrations; run `migrate`, check `showmigrations`).
3. Service: due slot = shared function, moved past holidays and R2 leave days, using `business_today`; skip never writes a `Meeting`; Held creates a normal `Meeting` through the existing path.
4. API: set/clear schedule (single and bulk), list due slots, skip with required reason. Scope is `scoreable_member_ids` only; never HBPR; employee read per R3.
5. Plan ends when the employee leaves the leader link (lazy, read-side); leader-authored skips stay with the author.
6. Add to `HOUSEKEEPING_MODELS` decision (skips are leader history: block deletes, do not add).
7. Hourly reminder job to the leader on due and overdue, idempotent keys, push after commit.
Test points: auto-row is never created; skip excluded from KPI per R1; holiday/leave push; HBPR cannot reach plan or skip (extend `test_hbpr_invariants`); closed-year unaffected; query count flat on the Team tab; restore round trip.

## Phase B: 1-on-1 cadence (frontend)
Files: `TeamTab.tsx` (column "Next 1:1" with status chip, row action, bulk "Set cadence" in the bulk bar), `TeamMemberDetailPanel.tsx` (schedule + Held/Skip), new dialogs reusing `CadenceScheduleFields` and `LogMeetingDialog` (date prefilled with the due slot), mobile card.
Gates: `modal-audit`, `table-header-audit`, `control-audit`, `surface-audit` (strict), vitest, eslint, tsc. Selection keys are member ids on `getRowId`. Tokens only, no emoji, keyboard and 320px.
Frontend gate (CLAUDE.md): click through on dummy data: set cadence, bulk set, Held, Skip with reason, clear, light and dark, zero console errors. Not done until clicked.

## Phase C: Backup + templates
1. Guard `reports.log_*` receivers with `kwargs.get('raw')`; test: restore adds no AuditLog rows.
2. Restore round-trip test for the new plan/skip models and cancelled HBPR slots.
3. Importers: declare reference source on the field once in `base.py`; generate dropdown, Reference Data sheet and sample from it; adopt in techs, clients, skill_categories, users `tech_codes`. A guard test fails when a code-keyed field has no source. Note CSV limits on the download button.

## Phase D: Docs (same PR as each phase)
`docs/workflow-invariants.md` new item (1-on-1 plan, skip, never auto-evidence); `CLAUDE.md` hot invariant + router row; `docs/hbpr-and-scorecard.md` (1-on-1 stays hidden); `docs/site-backup-and-restore.md`; `docs/team-lifecycle.md` section 8; `.devin/context/PLUGINS/06-data-import.md`. Grep old wording after.

## Out of scope
Team announcements (in-app plus push only; external chat is impossible without an API). Ask if you want it.
