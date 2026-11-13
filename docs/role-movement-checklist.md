# Role and leader movement: what must stay true, and how to check it

Written 2026-11-13 after the owner-rule work (PR #318, #319) and the mid-month move
simulation (PR #320). Read this before changing anything about leaders, links, teams or
roles, and before adding a feature that lists, counts, exports, notifies or pays by leader.
Rules live in `docs/workflow-invariants.md` items 36, 64, 65, 69, 73 and 82; this file is the
checklist and the map.

## 1. The model in five lines
- A leader is an active user who is a Line Manager (`albanian_tl`) or Manager (`italian_tl`) by role, legacy flag, link target, or lead of an ACTIVE team (`apps/users/services/leader_ownership.py::leader_user_ids`, same sources as `UserProfile.is_team_leader`).
- Authority is the link only: `UserProfile.albanian_tl` / `italian_tl`, read through `get_team_member_ids()`. `TeamMembership` and `Team.team_leader` are calendar-only (item 64).
- Overtime and standby rows have exactly one owner: the leader who decided them while that person is a leader, else the employee's current leader (Line Manager first, then Manager, skipping inactive or demoted ones).
- Leave, payroll and user-level year-close files follow the CURRENT link, not the decider. Leave ownership by decider is an open ruling.
- Frozen months, closed years and finalized payroll never change because someone moved.

## 2. Where each surface gets its scope (do not add a second definition)
| Surface | Source of truth |
|---|---|
| Overtime/standby leader queues | `core/mixins/permissions.py::_filter_owned_by_leader` (`owned_by_leader_q`) |
| Approve/reject permission | `PermissionService.can_approve` + `_leader_owns_row` |
| Leader exports (reports) | `apps/reports/filters.py::apply_visibility_constraints` |
| Dashboard `team_stats` | `apps/dashboard/viewsets.py` (owner rule for leaders) |
| Scorecard overtime block | `plugins/tl_scorecard/services.py` |
| Engagement | `plugins/engagement/services.py` (`owned_scopes`, `leader_team_pairs(month)`) |
| Year-close bundles | `plugins/year_close/services/builder.py` |
| Notifications (overtime/standby) | `plugins/notifications/signals.py::_team_recipients(owner_only=True)` |
| Notifications (leave) | same function, `owner_only=False`: both links |
| Leave, payroll scope, calendar, skills, KPI, org chart | live links via `get_team_member_ids()` / `get_calendar_member_ids()` |

## 3. Rules for new code
1. Never filter an approval, export, count or alert by `user_id__in` of team members for overtime or standby. Use `owned_by_leader_q` (and the Python twin `owner_leader_id`).
2. Never copy the leader definition. Change `leader_user_ids()` and `owned_by_leader_q` together and keep `test_python_owner_matches_the_queryset_owner` green; extend it with the new case.
3. Never use `Team.team_leader` or `TeamMembership` to grant data, approval or alerts.
4. A metric that sums over teams assigns each row to one team (`owner_team_id`).
5. A past month is recomputed with that month's data (`leader_team_pairs(..., month)`), never today's.
6. Never rewrite `approved_by`, `flagged_by`, `organizer`, `tl`, `leader` to hand records over (item 69).
7. A new request type with approvals needs the owner rule added deliberately, or an explicit decision to follow the links (like leave).
8. A new role or movement (PM, deputy, part-time, secondment, team merge): answer `docs/team-lifecycle.md` section 8, then run the checklist below.

## 4. Checklist before shipping a role or leader change
Run the simulations and extend them with the new movement:
```
py -3.14 manage.py test apps.users.tests_app.test_leader_ownership apps.users.tests_app.test_leader_ownership_followups apps.overtime.test_owner_simulation apps.users.tests_app.test_mid_month_move_sim_leave_payroll plugins.engagement.test_mid_month_move_sim_management plugins.engagement plugins.tl_scorecard plugins.year_close plugins.notifications
```
Then check by hand, for the employee, the old leader and the new leader:
- [ ] Queues and pending badges (overtime, standby, leave) list the row once, for one owner.
- [ ] Old leader: 403/404 by id on GET/PATCH/DELETE/approve/reject; bulk actions change nothing.
- [ ] Exports (reports, HR, TL, paid-block bundle, payroll) have each row once, none dropped.
- [ ] Payroll: one line per user, closure by one closer, finalized runs unchanged, `PayrollRunEntry` guard intact.
- [ ] Scorecard, engagement, year-close: counted once, frozen months untouched, Unassigned warning clean.
- [ ] Notifications reach only leaders who can act; deactivated leaders are skipped.
- [ ] Calendar, org chart, skills, Ticket KPI, control room follow live links; no archived-team leaks.
- [ ] HBPR: read-only, never one-on-ones, scope by stored assignment, records of a moved employee understood (open ruling).
- [ ] Team confidentiality: employees see only themselves (plus the team vacation calendar).
- [ ] Backup/restore: a new field or model is covered by `plugins/site_backup/tests/test_backup_coverage_guard.py`; signal receivers handle `raw=True`.
- [ ] Closed years and monthly locks still refuse writes for everyone.

## 5. Known open rulings (each is pinned by a test; change the test with the ruling)
1. Leave has no owner rule: both linked leaders may decide a request.
2. An employee who leaves a team keeps the old leader's scope until the link changes (item 36).
3. HBPR loses a Line Manager's records about an employee who moves to another Line Manager; the new HBPR cannot read them.
4. A `tl_sync` meeting with the Manager as counterparty is invisible to the assigned HBPR.
5. Control Room scope includes members of an archived team.
6. Two leaders closing one employee leave two closure rows (harmless).
7. Promotion history gaps (item 73).
8. Production settings accept the public placeholder `BACKUP_ENCRYPTION_KEYS` used by CI.

## 6. Known blind spots (not simulated as of 2026-11-13)
Browser UI for a move, payroll PDF/Excel contents, the real month-freeze job and `manager_changed_at`, push delivery, backup/restore round-trip of a moved employee (links are plain FKs in the PK-based fixture, so it should hold, but it was not run), year-close of leave and payroll files, and an admin-granted role `approve` permission on overtime (falls through `can_approve` and was not tested against the owner rule).
