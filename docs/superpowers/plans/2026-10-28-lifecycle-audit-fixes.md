# Lifecycle audit fixes (2026-10-28)

**Primary goal:** After a team or client is archived or deleted, no non-staff user sees its leftovers (workspaces, hierarchy gaps, stale admin lists), and admins never create a state the lifecycle rules forbid.

## Phase 0 - Verified facts (all read from code, 2026-10-28)
- `CalendarWorkspace.get_accessible_for_user` (apps/dashboard/models/calendar.py:129) `.exclude(team__is_active=False)` keeps `team IS NULL` rows, so a detached workspace with `is_public` or `allowed_users` stays visible to non-staff; `get_users_for_workspace` (l.165) then returns every active user. Detach only stamps `detached_at` (signals.py:63).
- `TeamViewSet.unarchive` (apps/users/viewsets.py:2089) and `team_lifecycle.unarchive_team` (l.241) never look at `parent_team`. `parent_team_id` already uses `Team.objects.active()` (serializers.py:461), so only unarchive is open.
- `invalidateTeamData` (useTeamsPageForm.ts:59-63) misses `["admin","profiles"]` and `["admin","user-stats"]`; `["admin","users"]` is still used by useLeaveBalances/LeaveRequestsPage, so keep it.
- `CLIENT_QUERY_KEYS` (useClientManagement.ts:12) misses `["admin","profiles"]`.
- `TeamSerializer.team_leader_id` uses `User.objects.all()` (serializers.py:452).
- `bulk_update_calendar_group` (viewsets.py:2246) has no `is_active` filter.
- SiteBranding admin saves skip `clear_maintenance_cache()` (only the viewset calls it); toast at MaintenanceControlCard.tsx:67 keys on `data.active` only.
- Allowed: `Team.objects.active()`, `archived_team_error`, `clear_maintenance_cache` (core.maintenance), `detached_at`. Do not add new packages or helpers.

## Phase 1 - Detached workspace visibility (HIGH)
Serves goal: closes the only non-staff leak of deleted-team data.
- Test first (apps/dashboard tests): non-staff with public / allowed detached workspace gets none; HR keeps holiday access to it (check HR path first); undetached team-less public workspace still visible.
- Change: exclude `detached_at__isnull=False` for non-staff. Do not key on `team IS NULL` (company calendars have no team).
- Verify: `py -3.14 manage.py test apps.dashboard` workspace + retention tests.

## Phase 2 - Unarchive under archived parent (HIGH)
Serves goal: keeps the team tree consistent.
- Test first: unarchive child while parent archived -> 409 with reason; after parent unarchived -> 200.
- Change: add the check to the unarchive viewset action (409, same shape as archive blockers). Reuse `archive_blockers` style message.

## Phase 3 - Team write validation (MEDIUM, LOW)
Serves goal: admins cannot assign unusable state.
- Tests first: inactive user as `team_leader_id` -> 400; bulk group update skips/rejects archived teams.
- Change: `team_leader_id` queryset `is_active=True`; bulk update filters `is_active=True` and returns the skipped count or uses `archived_error_for_refs`.

## Phase 4 - Frontend cache keys + copy (MEDIUM, LOW)
Serves goal: admin screens match the database right after a lifecycle action.
- Vitest first: archive/delete team invalidates profiles + user-stats; archive client invalidates profiles.
- Change: add the keys in both hooks. Pre-stage toast: branch on whether `is_active` was in the payload.

## Phase 5 - Branding cache (LOW)
- Test first: saving SiteBranding through the model clears the maintenance cache. Change: call `clear_maintenance_cache()` in `SiteBranding.save()` (mirror MaintenanceState.save, models/core.py:222).

## Final - Verify
`manage.py check`, targeted tests per phase, then once: `makemigrations --check`, full `manage.py test`, ruff, `npx tsc --noEmit`, vitest, build, `node scripts/modal-audit.mjs` is not needed (no dialog change). Update docs/team-lifecycle.md for the unarchive rule.

## Rejected / not now
- ClientViewSet `is_active` scope: archive already unassigns everyone and `validate_clients` blocks inactive clients.
- Rename workspace on reattach: `calendar_workspace_name_unique` could raise IntegrityError; not worth it.
- Open gap, own task: deactivating a user who is a `team_leader` leaves the team pointing at them.
