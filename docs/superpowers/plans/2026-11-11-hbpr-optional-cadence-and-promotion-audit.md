# Plan: HBPR assignment without cadence + promotion data audit

**Primary goal:** Admin can pair an HBPR with a Line Manager in one step (no schedule), the Line Manager sees a
banner until they set the cadence themselves, and we can state with test evidence that promoting an employee loses no data.

Branch: new branch off `main` (working tree holds uncommitted engagement work; never build on it). TDD, failing test first.

## Phase 0 - Facts found (sources)
- `HbprAlbanianTlAssignment.cadence` is NOT NULL, `CADENCE_CHOICES` (apps/users/models/hbpr.py:82); `clean()` rejects empty (:150).
- Service `create_assignment` requires it (`_validate_cadence`, apps/users/services/hbpr_assignments.py:45,74,185).
- Consumers that assume a value: `next_due_on`/`cadence_display` (model), `cadence_status` (service :288),
  expected-meetings count (tl_scorecard/services.py:412), reminders (tl_scorecard/reminders.py:37), serializers (:486,529,545),
  services_hbpr.py (:174-248), viewsets/scorecard.py:94.
- Line Manager already edits cadence: `POST tl_scorecard/partnership/cadence/`, `can_edit_cadence` (services_hbpr.py:241),
  `HbprCadenceDialog.tsx`, shared `CadenceScheduleFields.tsx`. Admin side: `HbprAssignmentDialog.tsx`, `hbprAssignmentService.ts`.
- Scorecard roster = `scoreable_member_ids` (scope.py), live per month; `ScorecardMonthSnapshot` only freezes leaders' months.
- Anti-patterns: do not default cadence to "monthly" (fakes expected counts and reminders); never delete evidence rows.

## Phase 1 - Promotion audit (tests only, no behaviour change)
**Serves goal:** proves the "no data loss" claim before we touch HBPR/scorecard code.
- New `plugins/tl_scorecard/test_promotion_history.py`; copy setup from `test_al_tl_not_scoreable.py` and `apps/users/tests_app/test_lm_promotion_link.py`.
- Pin: employee-era leave/OT/PIP/EPR/absence/ticket rows unchanged and still on the employee; old LM's frozen snapshots and
  `TLApprovalMetric` rows unchanged; new LM has no leader-keyed row before promotion; November scorecard = live roster.
- Report (not fix) gaps: no stored promotion date, so "starts from the promotion date" is not true today; old LM loses live
  access to the promoted user's open records once `albanian_tl` is cleared. Owner decides after seeing results.

## Phase 2 - Optional cadence (backend + migration)
**Serves goal:** lets the admin create the pairing without a schedule.
- Migration: `cadence` null=True, blank=True (relaxing only, reversible, existing rows keep values).
- Model `clean()`, `cadence_display`, `next_due_slot` return "not set"/None when empty; `_validate_cadence` allows None.
- `cadence_status` -> new `cadence_not_set` (checked before `not_started`); reminders skip it; expected count = 0 with flag.
- `update_assignment` accepts setting cadence from None; LM edit endpoint unchanged (`can_edit_cadence`).
- Tests: create without cadence (admin API), overlap/unique rules intact, status, reminders skip, expected count, edit later.

## Phase 3 - Frontend
**Serves goal:** admin form drops the requirement; LM is told to act.
- `HbprAssignmentDialog.tsx`: cadence optional (reuse `CadenceScheduleFields`, add "Set later"); types in `hbprAssignment.ts`.
- Line Manager scorecard + `HbprPartnershipSection.tsx`: banner "Set your HBPR meeting cadence" with button opening `HbprCadenceDialog`;
  HBPR workspace shows "Cadence not set" (hbprMeta.ts). Use shared Alert/tone tokens, no raw colours.
- vitest for each; then `modal-audit`, `control-audit`, `surface-audit`.

## Phase 4 - Site backup/restore, docs, workflow
**Serves goal:** the change survives restore and the next engineer finds the rule.
- Backup: model already auto-included; confirm with `plugins/site_backup/tests/test_backup_coverage_guard.py`, add a restore round-trip
  test for a NULL-cadence row. Note: older backups carry the old `migration_state_hash`, restoring them onto the new schema is blocked by design.
- Docs: `docs/hbpr-and-scorecard.md` (cadence optional, banner, status), `docs/workflow-invariants.md` (new item), CLAUDE.md Hot Invariants
  (HBPR bullet + promotion note), `docs/site-backup-and-restore.md`, `.devin/context/PLUGINS/08-hbpr-scorecard.md` and `07-backup-restore.md`.
- Update `seed_e2e_data` and add one Playwright step (admin assigns, LM sees banner, sets cadence).

## Phase 5 - Verify
**Serves goal:** nothing else broke.
- `py -3.14 manage.py makemigrations --check`, `migrate`, targeted `apps.users`, `plugins.tl_scorecard`, `plugins.site_backup`, then full suite once.
- `ruff`, `npx tsc --noEmit`, vitest, `npm run build`; grep `cadence` consumers for unguarded `.cadence ==` / `dict(CADENCE_CHOICES)[...]`.
