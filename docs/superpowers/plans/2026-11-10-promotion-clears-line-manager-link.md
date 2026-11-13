> Superseded by `2026-11-10-link-only-scope-and-lm-promotion.md` (Phase 2 there; implemented).

# Plan: promoting to Line Manager clears the user's own Line Manager link

Goal: rule "a Line Manager has no Line Manager above them". Today promotion only sets the role; the
user's own `albanian_tl` FK stays, so the old Line Manager keeps approvals/leave/OT access (`get_team_member_ids`)
while the scorecard already excludes them (`scoreable_member_ids`). Closing that gap, nothing else.

## Decisions (confirm before build)
- Clear ONLY `albanian_tl`. Never `italian_tl`: a Line Manager under a Manager is valid (scope.py docstring).
- Do NOT touch team membership (`change_user_teams` owns it), and no team warning (owner decision 2026-11-10).
  Known, accepted: `get_team_member_ids()` also scopes by shared team, so a shared team can still reach the user.
- Rule: no two Line Managers in a chain; the Manager (`italian_tl`) link is kept.
- No data migration. Existing conflicting rows are reported, not auto-fixed (see step 5).
- Hook lives in `_sync_roles` / `_sync_legacy_roles` (`apps/users/services/user_creation.py`), which
  update_user, bulk_update and create all call. NOT inside `assign_role` (seeds/tests grant roles directly).

## Files
- `apps/users/services/user_creation.py` (new helper + two call sites)
- `apps/users/viewsets.py` (400 guard in update_user, bulk_update, create)
- `apps/users/tests_app/test_lm_promotion_link.py` (new)
- `docs/workflow-invariants.md` (item 63), `docs/team-lifecycle.md` §3 (one line)
- Frontend: none expected; existing toast already renders `warnings[].message`.

## Steps (TDD, failing test first each time)
1. Test: promote an employee pointing at LM X via update_user -> `albanian_tl` is NULL, X no longer in
   scope of the user; `italian_tl` unchanged; records untouched; an `AuditLog` row `tl_link_cleared`.
2. Helper: when the role is being granted and `albanian_tl_id` is set, null it and audit it (same style as
   `tl_link_followup`'s clearing). Idempotent: an existing LM with no link writes nothing.
3. Same behaviour via bulk_update (legacy flag path) and create (new user created as LM with a link).
4. Guard: payload that sets a non-null `albanian_tl` on a user who is or becomes a Line Manager -> 400 with a
   field error (same shape as `_invalid_leader_error`). Prevents re-creating the conflict from the edit form.
   Request that promotes AND reassigns in one go is rejected, not silently dropped.
5. Warning in the response: `no_manager_after_promotion` (italian_tl empty, nobody can approve the new LM's own requests).
   Optional: add "Line Manager with a Line Manager" to `find_orphans` so legacy rows are visible.

## Test points
- Promote via roles array AND via legacy `is_albanian_tl_role`; revoke LM role does not restore the link.
- Re-saving an existing LM changes nothing; HBPR assignments and PIP/EPR/absence rows untouched.
- Team membership identical before/after promotion; query counts of update_user/bulk_update unchanged.
- Scorecard snapshots and frozen months unaffected (no leader-keyed row is written).
- Verify: `py -3.14 manage.py test apps.users.tests_app.test_lm_promotion_link`, then `apps.users`, `ruff`.

## Risks
- Low: one FK write on a role transition, no schema change, no migration. Main risk is a seed/importer that
  creates an LM with a link on purpose; step 4 would reject it (check `seed_e2e_data`, users importer).
- Working tree already holds uncommitted work: branch off main first, one branch per PR.
