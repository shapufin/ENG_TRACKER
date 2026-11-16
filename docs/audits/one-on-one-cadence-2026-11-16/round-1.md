# Audit round 1: 1-on-1 cadence, team messaging, standby pending, backup, templates

Date 2026-11-16. HEAD 2c0b78e on main. Audit only, no code changed.
Baseline: full suite NOT run (no fixes in this round). One targeted test run: `apps.overtime.test_owner_simulation -k s9` passes.
Render gates (contrast, overflow, 280px) are UNMEASURED: no browser was driven. Findings below are code-verified.

## 1. Employee 1-on-1 cadence (idea 1)

What exists (verified in code):
- A 1-on-1 is a `Meeting` row (`meeting_type=one_on_one`, organizer = Line Manager, counterparty = employee). No schedule, no status, no cancel reason (`plugins/tl_scorecard/models.py:36`).
- The KPI is monthly: an employee is compliant if one 1-on-1 exists in the month (`services.py:173-189`). The Team tab already shows `last_one_on_one_on` (`team_members.py:166`), only in the detail panel.
- The schedule engine lives on `HbprAlbanianTlAssignment` (`apps/users/models/hbpr.py`: `next_due_slot`, holiday push, nth-weekday). Cancelled slots exist only on `HbprGovernanceEvidence` (`status`, `cancel_reason`).
- One-on-ones are hidden from the HBPR through every door (`hbpr_exclude`, signals skip them, `test_hbpr_invariants.py` walks every route).

Findings that shape the design:
- HIGH: "register automatically" must NOT write `Meeting` rows by itself. A meeting row is evidence that a meeting happened and feeds the compliance KPI; an auto-created row would fake it. Auto = compute the due date and prefill the modal; the leader confirms Held or Skip.
- HIGH: `Meeting` has no skip state. Adding `status` to `Meeting` touches every consumer (KPI, exports, `last_one_on_one`, HBPR exclusion). A separate skip record is the smaller, safer diff.
- MEDIUM: the schedule maths is private to the HBPR assignment model. Copying it makes two drifting definitions; extract one pure function and have both call it (existing HBPR tests pin it).
- MEDIUM: new model touches user-deletion blockers (`HOUSEKEEPING_MODELS`), team-lifecycle checklist (`docs/team-lifecycle.md` section 8), leader-move rule (leader-authored records stay with the author), and Backup (see 4).
- MEDIUM: ruling needed, see plan (skip vs KPI, leave-aware slots, who sees the schedule).
- LOW: migrations folder of `tl_scorecard` is blocked by a local deny rule; the plan needs it lifted for makemigrations.

## 2. Messaging to teams (idea 2)

Verified: in-app notifications plus Web Push (VAPID) exist and need no third party (`plugins/notifications`). Email is configured only in `settings_production.py` (SMTP env credentials; the old email plugin was removed on purpose). No Slack, Teams or WhatsApp integration exists, and those need an external API or webhook you do not have.
Verdict: external chat is not possible, SKIP. A leader "announcement to my team" through in-app plus push is possible without any API, but it is a new feature (event type, kill-switch, recipient scope via `get_team_member_ids()`, UI). Left out of the plan; offered as a separate item.

## 3. Line Manager's own standby not in Pending (idea 3)

Verified: INTENDED, and pinned. Owner rule (workflow-invariants item 82 (d)): a leader's own pending row is owned by THEIR leader, so it shows in the Manager's Pending queue, not the Line Manager's own (`owned_by_leader_q`; `test_s9_leader_own_rows_listed_only_by_their_own_leader`, passes). Standby uses the same code path as overtime.
Two real gaps (code-read, not yet reproduced in a browser):
- MEDIUM: the 2026-10-21 ruling lets a leader decide their own overtime/standby (`permission_service.can_approve`), but the owner rule hides the row from their own queue, so that permission is only reachable by the API or the personal page. Needs your ruling: keep, or show the leader's own pending rows in their queue labelled "Your own".
- MEDIUM: a Line Manager with no Manager link has no owner at all (`owner_leader_id` returns None); their pending rows appear in no leader queue, only to staff. The "not showing" you saw can be this. Check that user's `italian_tl` first.

## 4. Backup plugin coverage (idea 4)

Verified: backup dumps every model by default and subtracts `EXCLUDED_APPS/MODELS` (`services/backup.py:30-43`), so new models travel automatically. The coverage guard, round trip and sequence reset tests exist. Excluded on purpose: MFA rows, JWT tokens, client export jobs, year_close archives.
Findings (receivers run on a raw restore; I listed every connected receiver and checked for a `raw` guard):
- MEDIUM: `apps/reports/signals.py` `log_overtime_change`, `log_standby_change`, `log_leave_change` have no raw guard, so a restore writes a fake CREATE/UPDATE `AuditLog` row for every restored overtime, standby and leave row, attributed to the restoring user. Pollutes the audit trail.
- LOW: `plugins/analytics/models.py` config post_save/post_delete only invalidate a cache (harmless). `reports.log_deletion` (post_delete) also unguarded, fires on delete-missing.
- LOW: no restore test yet for HBPR evidence, cancelled slots or any 2026-11 model beyond `HbprAssignmentNullCadenceRestoreTests`; new 1-on-1 models need the same.
- Env keys (`BACKUP_ENCRYPTION_KEYS`, `MFA_ENCRYPTION_KEYS`) are documented, unchanged.

## 5. Sample templates (idea 5)

Verified: templates are already dynamic. `get_dynamic_sample_rows`, `get_reference_data` (Excel Reference Data sheet) and `get_field_dropdowns` (in-cell dropdowns) exist and fall back to static rows (`importers/base.py:154-195`, `parsing.py:305`).
Gaps:
- MEDIUM: no live rows, dropdowns or reference sheet for `techs` (reference only), `clients` (static rows), `skill_categories`. `tech_codes` in users has no dropdown (multi-value `CODE:LEVEL`), only a reference sheet.
- MEDIUM: each importer hand-builds its own lookups, so a new entity type is "automatic" only if someone remembers. Fix once: declare the source on the field (model, code attribute, label) in the base class and generate dropdown, reference sheet and sample value from it.
- LOW: CSV cannot carry sheets or dropdowns; it only gets the dynamic rows. State this in the download button.
- LOW: dynamic users sample uses placeholder usernames with real team/leader codes, fine. Check that `is_hr/is_italian_tl` columns still match the grant-based roles after S1 (unverified).
- Non-import exports (reports, scorecard) have no templates; out of scope.

## Deferred
Team announcements (2), CSV-reference limits, any visual claim (unmeasured).

## Correction and results (same day, after implementation)
- Idea 5 was overstated: a per-importer check showed every importer already has live dropdowns and Reference Data except plain creation sheets (techs, clients, skill categories need none). The real defects were smaller: the Teams template cut the leader dropdown at 30 users and the reference list at 50, and had no `calendar_group` list. Fixed, pinned by `plugins/data_import/test_template_live_lists.py`.
- Idea 4: `log_change` raw guard added (`apps/reports/test_audit_raw_restore.py`), restore round trip for the new models added.
- Idea 1 implemented: backend (`one_on_one.py`, `OneOnOnePlan`, `OneOnOneSkip`, API, reminders) and Team tab UI, clicked in a real browser on desktop and mobile (`frontend/e2e/one-on-one-plan.spec.ts`, 2 passed each). Light/dark and 320px visuals were not captured.
- Deferred: R3 (employee sees their next 1-on-1), R4 (kept as is), team announcements.

## Round 2 (final review before merge)
Findings: 1 MEDIUM, fixed and pinned. Reminders read every plan, so a plan left behind by a moved employee would have nagged the old leader (`test_a_plan_for_someone_who_left_the_team_never_nags_the_old_leader`); skipping also now re-checks team scope. Lessons are item 86 of `docs/workflow-invariants.md`.
Scorecard: round 1 had 0 critical, 2 high, 8 medium, 4 low (design and audit findings); all high and medium resolved or ruled (R1-R4), lows deferred; 1 new medium found in round 2 and fixed; 1 overstated finding (idea 5) corrected, false-positive rate 1 of 15.
