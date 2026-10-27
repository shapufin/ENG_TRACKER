# Team lifecycle and metric durability

Source of truth for how a team is retired, what survives it, and when a month's metrics stop
changing. Rules also summarised in `docs/workflow-invariants.md` item 36. Plan and decision log:
`.devin/plans/plan-9588553cf8e6c2e9.md` (local). Written 2026-10-27.

## 1. Retire by archive, delete only when nothing depends on it

A team is retired by **archiving** it, the same idea as a Client (`docs/workflow-invariants.md` item 30).

| Step | What happens | Code |
|---|---|---|
| Archive `POST users/teams/{id}/archive/` (admin) | Writes `TeamMembershipHistory` for every member, removes the memberships, sets `is_active=False`, `archived_at`, `archived_by`, audits. Records of those members are untouched. `team_leader` is kept. | `apps/users/services/team_lifecycle.py` |
| Unarchive `POST .../unarchive/` | Reactivates. Members are **not** restored. | same |
| Lifecycle `GET .../lifecycle/` | Counts, blockers, last activity, purge date for the dialog. | same |
| Delete `DELETE users/teams/{id}/` | `409 {detail, blockers, counts, cascade_counts}` unless allowed (below). Never a 500. | `TeamViewSet.destroy` |
| Purge | `purge_team(team, request)`: archived for **365 days**, no team activity in 365 days, no CASCADE dependents, no active sub-teams, and the **year it was archived in is closed** (`ClosedYear`). Command: `manage.py purge_archived_teams [--dry-run]` (also purges expired detached workspaces). | `team_lifecycle.purge_team` |

**Archive is refused (409 `blockers`) when:** the team has active sub-teams (`parent_team` drives
Italian-to-Albanian TL inheritance), a member would be left with no other active team and no
`italian_tl`/`albanian_tl` while having a pending leave/overtime/standby request, or the team leader has an
open HBPR assignment.

**Delete is allowed only for** a never-used team (no members now or before, no history, no metric with
`team_size > 0`, no sub-teams, no Control Room scope, no workspace holding holidays). Any used team must be
archived first. A zero-size engagement row never blocks. Every CASCADE reverse relation of `Team` counts as a
blocker, so a delete can never silently take rows with it (this is how `ControlRoomTeamScope` is covered
without core importing the plugin).

**Archived teams** are hidden from the default team list (`?is_active=false` shows only archived, `all` both),
from `list_for_reports`, `root_teams` and the parent-team picker. They reject new members on every entry
point: `UserProfileSerializer.validate_teams`, `create_user_with_profile`, `update_user_profile`,
`update_user` (both `teams` and legacy `team`), `bulk_update`, and the users importer. Name and code stay
reserved (both are unique) until the team is purged.

**An archived team keeps its leader but confers no TL status:** `UserProfile.is_team_leader` and
`get_team_member_ids()` only count `led_teams` with `is_active=True`, so unarchiving restores the leadership
losslessly. A leader of one archived and one active team stays a TL.

## 2. What survives a team delete

All of these become `SET_NULL` with a stored label, so history stays readable:

- `TLApprovalMetric` (`team_name`, `team_code`) and `AnalyticsMetric` (`team_name`): a row whose team is gone
  is history only, never stale and never recomputed. Serializers show the live name while the team exists,
  the stored label after. A `pre_delete(Team)` receiver in each app refreshes the labels at delete time (so
  a rename after the snapshot is not lost); core never imports a plugin. Copy this pattern for any new model.
- `ApprovalPeriodCloseMember` (`source_team_name`, `source_team_code`).
- `TeamMembershipHistory` (team, user, remover all `SET_NULL`; `team_name`, `team_code`, `username` copied).
- The team's `CalendarWorkspace` is **never deleted with the team**. It is detached (`team` NULL,
  `detached_at` stamped) with its holidays and user preferences.
  `apps/dashboard/services/workspace_retention.purge_detached_workspaces()` removes one only after 365 days,
  with **no** holiday rows (soft-deleted ones count) and no active `UserCalendarPreference`. Re-creating the
  team with the same code reattaches the workspace and clears `detached_at`. Workspaces of an archived team
  are closed to non-staff (even an explicitly allowed user or a calendar-group peer); staff still see them,
  `?detached=true` lists the orphans.

## 3. Membership changes

Every writer goes through `apps/users/services/team_membership.change_user_teams` (user form, bulk edit,
create, importer, `_assign_team_to_profile`):

- It diffs **sets**, so leaving team A never touches team B, its calendar access or TL scope.
- It writes `TeamMembershipHistory` for removed teams and an audit row per add/remove
  (`model_name='team'`, `operation` `member_add` / `member_remove`, `extra_data` has `user_id`, `username`).
- Nothing changed means nothing written. Overtime, standby, leave and KPI records are never touched.
- `italian_tl` / `albanian_tl` are a **separate** path in `get_team_member_ids()`, so removing a user from a
  team does not remove their TL. `tl_link_followup` returns `warnings` (shape
  `{code:'tl_link_remains', field, user_id, leader_username, member_id, member_username, teams, message}`) and
  `removed_team_leaders` for links that still point at a leader of a removed team. Send
  `unassign_removed_tl: true` (update_user, bulk_update) to clear exactly those links in the same save
  (audited as `tl_link_cleared`). A leader who still leads a team the user keeps, or whom another member of a
  kept team points at, is never flagged or cleared. The user's own link is not evidence of leadership.

## 4. Metrics freeze

Month M's engagement and scorecard metrics are provisional until **00:00 on `METRICS_FREEZE_DAY` (default 10)
of M+1, Europe/Tirane** (`core/utils/metrics_freeze.py`), then immutable. Why the 10th: OT/standby work dates
can be created until 00:00 on the 2nd of M+1 (`work_date_cutoff`) and approvals are exempt from the monthly
lock, so the approval queue needs days to settle. The freeze covers **metrics only**; record locks, payroll
finalize and the closed-year lock are unchanged. A decision made after the freeze never reaches the metric
(accepted).

**A row is final iff it was computed at or after the freeze moment** (`is_frozen(month, computed_at)`).
A row computed earlier gets exactly one last recompute, then stops.

- **Engagement** (`plugins/engagement/services.py` `stale_snapshot_ids`): never-computed or old-shape rows are
  always stale; past the freeze a row is stale only if not final; before the freeze the live checks apply
  (deadline passed, member set changed, member record touched). Reads do the final recompute lazily.
  `manage.py finalize_frozen_metrics [--dry-run]` does it in bulk: run it **once at deploy** and optionally
  from cron. `recompute_tl_metrics` skips final rows unless `--include-frozen`. Serializer exposes `frozen`.
  `leader_team_pairs` / `candidate_leader_ids` ignore archived teams (no empty monthly rows).
- **Scorecard** (`plugins/tl_scorecard`): `ScorecardMonthSnapshot(leader, month)` stores only the
  month-bound blocks (`team_size`, `leave`, `overtime`, `meetings`), unmasked (HBPR masking is applied on the
  returned copy). Year-to-date and current-state blocks stay live. Snapshots are written **by the scheduler
  job `freeze_scorecard_months` (hourly) or `manage.py freeze_scorecard_months [--month]`, never on read**, because a
  snapshot first computed months later would reflect today's membership. A snapshot written before the
  freeze moment is not trusted. `build_scorecard`, `scorecard_trend` and the exports all go through the same
  `snapshot_blocks`, so they agree; the payload carries `frozen`. Months before this shipped have no true
  snapshot: they are computed live, and a command backfill reflects **today's** membership.
- Governance records (PIPs, EPR, meetings, evidence) are decisions, not metrics, and stay live.

## 5. Operations

| Job | Command | When |
|---|---|---|
| Final recompute of engagement snapshots | `finalize_frozen_metrics` | once after deploying the freeze; optional daily cron |
| Scorecard month freeze | scheduler job `freeze_scorecard_months` (needs the `scheduler` service) | hourly, no-op once the latest frozen month is done |
| Archived team + detached workspace purge | `purge_archived_teams [--dry-run]` | monthly cron; opt-in, never at boot (workflow-invariants item 17); skips any team with blockers |

After pulling: `py -3.14 manage.py migrate` (users 0024-0025, dashboard 0013, analytics 0011, engagement
0004, tl_scorecard 0006); confirm `showmigrations` has no `[ ]`.

## 6. Known gaps and open work

- **Year close (resolved 2026-10-27).** The build never failed (users outside every pair go to `Unassigned`),
  but an archive moved a member's evidence out of the team's bundle. `builder._pair_members(pairs, year)` now
  adds `TeamMembershipHistory` users who were in the team during the year (left on/after 1 Jan of it, joined
  on/before 31 Dec), so the bundle keeps its people. A purge also waits for the archive year to be closed.
- Other `Team.objects` call sites (`apps/dashboard/admin_*`, `plugins/control_room`, `ticket_kpi`,
  `analytics`, importers `teams`/`control_room_access`, `notifications/signals`) still see archived teams;
  move picker-style lists to `Team.objects.active()`.
- `apps/dashboard/admin_overview.py` and `plugins/organigrama` still read `led_teams` unfiltered.
- No frontend yet: archive/unarchive/lifecycle dialog, TL-link warning checkbox, "Frozen" badge,
  unlinked-workspace filter, and the new response fields in `types/index.ts`.
- Delete stays staff-level (`IsAdminUser`), not superuser-only. No payroll blocker (payroll has no team link).

## 7. Tests

`apps/users/tests_app/test_team_durability.py`, `test_team_lifecycle.py`, `test_team_membership.py`,
`apps/users/tests_app/test_team_purge_command.py`, `plugins/year_close/test_archived_team.py`,
`apps/dashboard/tests/test_workspace_retention.py`, `plugins/engagement/test_freeze.py`,
`plugins/tl_scorecard/test_freeze.py`, `core/utils/test_metrics_freeze.py`,
`core/services/test_related_records.py`.
