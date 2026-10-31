# Team lifecycle and metric durability

Source of truth for how a team is retired, what survives it, and when a month's metrics stop
changing. Rules also summarised in `docs/workflow-invariants.md` item 36. Plan and decision log:
`.devin/plans/plan-9588553cf8e6c2e9.md` (local). Written 2026-10-27.

## 1. Retire by archive, delete only when nothing depends on it

A team is retired by **archiving** it, the same idea as a Client (`docs/workflow-invariants.md` item 30).

| Step | What happens | Code |
|---|---|---|
| Archive `POST users/teams/{id}/archive/` (admin) | Writes `TeamMembershipHistory` for every member, removes the memberships, sets `is_active=False`, `archived_at`, `archived_by`, audits. Records of those members are untouched. `team_leader` is kept. | `apps/users/services/team_lifecycle.py` |
| Unarchive `POST .../unarchive/` | Reactivates. Members are **not** restored. Refused with 409 and `blockers` while the parent team is still archived (`unarchive_blockers`), so an active team never sits under an archived parent. | same |
| Lifecycle `GET .../lifecycle/` | Counts, blockers, last activity, purge date for the dialog. | same |
| Delete `DELETE users/teams/{id}/` | `409 {detail, blockers, counts, cascade_counts}` unless allowed (below). Never a 500. | `TeamViewSet.destroy` |
| Purge | `purge_team(team, request)`: archived for **365 days**, no team activity in 365 days, no CASCADE dependents, no active sub-teams, and the **year it was archived in is closed** (`ClosedYear`). When the year-close plugin is disabled the year can never close, so the purge only waits for that year to have ended. Command: `manage.py purge_archived_teams [--dry-run]`; it reports every skipped team with its blockers (also purges expired detached workspaces). | `team_lifecycle.purge_team` |

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
  are closed to non-staff (even an explicitly allowed user or a calendar-group peer), and so are detached
  workspaces, public or shared (`get_accessible_for_user` excludes `detached_at`, not "team is NULL": company
  calendars have no team); staff still see them, `?detached=true` lists the orphans.

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

## 6. Frontend

- **Teams page** (`/admin/teams`): a Status chip row (Active / Archived / All, default Active) over one dataset
  loaded with `?is_active=all`; row actions Edit, Archive, Delete for active teams and Edit, Restore, Data for
  archived ones; an "Archived" badge in the name column. Archive opens `ArchiveTeamDialog` (live member count and
  the server's archive blockers; confirm disabled while any exist). **Data** opens `TeamLifecycleDialog`
  (members, archived on, purge-eligible date, last activity, records kept, what a delete would detach, delete
  blockers, and a delete that needs the typed team code). Archive follows the row to the Archived view and
  Restore back to Active, like Clients. A 409 on delete or archive shows the server's `blockers` in a toast.
  Mutations invalidate `["admin","teams"]`, `["admin","calendar-groups"]`, `["admin","users"]`,
  `["admin","profiles"]` (the Users page rows) and `["admin","user-stats"]`. A 409 on Restore (parent team still
  archived) shows the server's `blockers` too. Client archive invalidates `["admin","profiles"]` for the same reason.
- **Users**: the edit dialog shows "Also clear the Italian/Albanian TL link..." only when a team was removed and a
  TL link is set; the bulk drawer has the same checkbox under Teams. Both send `unassign_removed_tl`. After a save
  that left a link, a warning toast carries the server's `warnings[].message`.
- **Frozen**: engagement summary and scorecard subtitles end with " · Frozen" when the month is final
  (`summary.frozen`, `scorecard.frozen`). Calendar workspace options of a deleted/archived team are labelled
  "(team deleted)" / "(team archived)". A dedicated unlinked-workspace page does not exist: use
  `GET calendar-workspaces/?detached=true`.
- Types: `Team.is_active/archived_at/archived_by`, `TeamLifecycle`, `TeamLinkWarning`, `CalendarWorkspace.team_is_active/detached_at`.

## 7. Known gaps and open work

- Several `Team.objects` call sites still see archived teams on purpose or by omission: Control Room scope
  validation and dashboards (`plugins/control_room`; assigning a scope to an archived team is harmless and
  existing scopes must stay editable), `ticket_kpi`, `notifications/signals`, the `teams` and
  `control_room_access` importers. Counts that say "active teams" (admin overview, trends, dashboard widget,
  analytics) now use `Team.objects.active()`.
- Closed 2026-10-28: the admin period-close TL list, the Control Room company-wide coverage rows and the
  organigrama Albanian-TL employee lookup now ignore archived teams (they showed phantom TLs / empty teams).
  `UserRole.team` is `SET_NULL` but nothing reads it for scope, so a delete cannot widen a role.
- **Deactivating a team leader** changes nothing else (so reactivating restores it all): `Team.team_leader` and
  members' TL links stay. The Users importer adds a row warning naming the active teams they lead and the
  members still linked to them (`user_deactivation.deactivation_warnings`), Django admin shows the same lines as
  warning messages on save (`LeaderAwareUserAdmin`, 2026-10-31), and notification recipients skip
  inactive users. The `update_user` API action cannot deactivate. Revoking a TL *role* is a different path: it is
  refused while members still point at the user, and the admin UI answers with `TlRevokeBlockedDialog`.
- **Checked 2026-10-31, harmless by construction:** the notification recipient lookup and the Ticket KPI
  team export both resolve members through `Team.members`, which an archive empties, so an archived team's
  leader reaches nobody through them. They still read archived rows; add `is_active=True` only if a path appears
  that does not go through membership.
- **Data check** (`/admin/data-check`, `GET users/teams/orphans/`): people in no active team, active teams without
  a leader or without members, active clients nobody works on. Read-only; see `workflow-invariants.md` item 44.
- Delete stays staff-level (`IsAdminUser`), not superuser-only. No payroll blocker (payroll has no team link).
- Two pre-existing `CONTROL-HEIGHT` control-audit warnings in `plugins/organigrama/components/CustomChartViewer.tsx`
  are not from this work.

## 8. Relationship map and checklist for anything new that touches a team

Generated 2026-10-28 from `Team._meta.related_objects`; regenerate it after adding a relation
(`py -3.14 manage.py shell`, loop `Team._meta.related_objects`, print `field.on_delete`).

| Points at Team | On team delete | On archive | Rule |
|---|---|---|---|
| `users.TeamMembership` / `UserProfile.teams` (M2M) | CASCADE | removed, history written | only `team_membership.change_user_teams` writes it |
| `users.TeamMembershipHistory.team` | SET_NULL + copied label | kept | history is never deleted |
| `users.Team.parent_team` | SET_NULL | blocked while active sub-teams; a child cannot be restored under an archived parent | hierarchy drives TL inheritance |
| `dashboard.CalendarWorkspace.team` | SET_NULL, `detached_at` stamped | closed to non-staff | detached is hidden from non-staff too |
| `analytics.AnalyticsMetric`, `engagement.TLApprovalMetric`, `users.ApprovalPeriodCloseMember` | SET_NULL + copied label | kept as history | a row without a team is never recomputed |
| `tl_scorecard.Meeting`, `tl_scorecard.EngagementSurveyResponse` | SET_NULL, **no label** | kept | so a delete is **refused** while any exist (`KEPT_EVIDENCE` in `team_lifecycle.py`); give a new SET_NULL relation a label or add it there |
| `permissions.UserRole.team` | SET_NULL | kept | nothing reads it for scope, so a delete cannot widen a role |
| `control_room.ControlRoomTeamScope.team` | CASCADE | kept (existing scopes stay editable) | counted as a delete blocker |
| `Team.team_leader` (User) | n/a | kept, confers no TL status | new leaders must be active users; a leader who left may stay on edit |

**Money and clients.** Payroll has no foreign key to `Team` or `Client` (checked 2026-10-28): a payroll run
reads overtime logs, and `PayrollRunEntry` freezes what was paid, so archiving or deleting a team or client cannot
change a payslip. Client relations: `OvertimeLog.client` PROTECT (a client with overtime can never be deleted),
`StandbyLog`, `KPIEvidence`, `TicketImportBatch`, `ExportProfile` M2M (blocked by a `pre_delete(Client)` guard),
`onboarding.Folder/Document` CASCADE (blocked until purged first), `onboarding.ClientExport` SET_NULL,
`UserProfile.clients` (archive unassigns, history of work stays on the records). Archive is the normal retirement.

**Before shipping a feature, plugin or role (PM, etc.) that references a team, answer all of these in the PR:**

1. **Relation:** what is `on_delete`? Prefer `SET_NULL` plus copied `*_name`/`*_code` labels and a `pre_delete(Team)` receiver in the owning app (core never imports a plugin). Add the row to the table above.
2. **Archived:** does every list, picker, count, scope and "who can see" query use `Team.objects.active()` or `is_active=True`? Does an archived team confer nothing (no TL status, no new members, no visibility)?
3. **NULL join trap:** `.exclude(team__is_active=False)` keeps rows whose team is NULL. If a row can outlive its team, exclude it explicitly (as `detached_at` does) and test the detached case.
4. **Scope:** a new role resolves who it covers through `UserProfile.get_team_member_ids()` only, never by filtering teams in the ORM. A role that leads or manages a team follows the TL rules for archived teams.
5. **Hierarchy:** archive, restore and re-parent keep the tree valid (no active team under an archived parent, no cycles).
6. **Membership:** every write goes through `change_user_teams`; an archived team rejects new members at every entry point (form, bulk, importer, create).
7. **Frozen data:** history, metrics and closed years never change because a team was archived or deleted.
8. **Frontend:** the page invalidates every query key that lists the affected rows (Users page = `["admin","profiles"]`, `["admin","user-stats"]`), shows the server's `blockers` on a 409, and has a way to restore.
9. **Tests:** archive, restore, delete and "detached/archived is invisible to a non-staff user" each have a test. `apps/users/tests_app/test_team_lifecycle.py` and `apps/dashboard/tests/test_workspace_retention.py` are the templates.

## 9. Tests

`apps/users/tests_app/test_team_durability.py`, `test_team_lifecycle.py`, `test_team_membership.py`,
`apps/users/tests_app/test_team_purge_command.py`, `plugins/year_close/test_archived_team.py`,
`apps/dashboard/tests/test_workspace_retention.py`, `plugins/engagement/test_freeze.py`,
`plugins/tl_scorecard/test_freeze.py`, `core/utils/test_metrics_freeze.py`,
`core/services/test_related_records.py`.
Frontend: `TeamLifecycleDialog.test.tsx`, `UserEditFormDialog.test.tsx`, `UserBulkCommandDrawer.test.tsx`,
`useTeamsPageUI.test.ts`, `useUsersPage.test.ts`; end to end `frontend/e2e/team-archive-lifecycle.spec.ts`
(owns a probe team and member; run with the runbook in the e2e memory/README: `prepare_e2e_db` first).
