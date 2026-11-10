# Plan: internal data scope is link-only; promotion clears the Line Manager link

Supersedes `2026-11-10-promotion-clears-line-manager-link.md` (that plan becomes Phase 2 below).
Owner rulings (2026-11-10): teams and workspaces are for the calendar only; internal data (approvals, leave,
overtime, standby, scorecard, skills) is visible only to the Line Manager / Manager the employee is assigned to
(`albanian_tl` / `italian_tl`). Two Line Managers in one chain are not allowed. The Manager link stays.

## Phase 1 - `get_team_member_ids()` = FK links only
Design: calendar keeps today's behavior through a NEW method `get_calendar_member_ids()` (old 3-source body),
used only by the two calendar call sites (`apps/dashboard/models/calendar.py`, `apps/dashboard/viewsets.py`).
Every data caller keeps calling `get_team_member_ids()`, which drops shared-team and `led_teams` sources.
Files (three copies of the rule must stay in parity, plus docs):
- `apps/users/models/core.py`; `plugins/year_close/services/builder.py` (`managed_member_ids_bulk`);
  `plugins/engagement/services.py` (`_managed_map`); calendar call sites above.
- Do NOT change: `is_team_leader` status, calendar `_get_workspace_user_ids` peer visibility, team lifecycle.
- Docs: CLAUDE.md "Team member resolution", `docs/workflow-invariants.md` (new item), `docs/team-lifecycle.md` §3,
  `plugins/skills/services/team_query.py` docstring, `apps/dashboard/viewsets.py` comment.
- New read-only command `audit_team_only_scope`: lists every leader and each person reachable ONLY via
  team/led_teams today (run on production BEFORE deploy; changes nothing).
Steps (TDD): 1 failing tests: shared team grants nothing; led_teams grants nothing; FK link grants; calendar
workspace still reachable for a team member and a Team leader; 2 change core; 3 parity copies; 4 fix existing
tests that encoded the old rule (each one reviewed, not blindly edited); 5 audit command + test.
Gate: `manage.py test` full, browser check as TL with and without a link (approvals, calendar, org chart).

## Phase 2 - promotion clears the user's own `albanian_tl`
Files: `apps/users/services/user_creation.py` (helper in `_sync_roles`/`_sync_legacy_roles`),
`apps/users/viewsets.py` (400 guard: a Line Manager cannot be given an `albanian_tl`), new
`apps/users/tests_app/test_lm_promotion_link.py`, docs item. Manager (`italian_tl`) and teams are untouched.
Warning `no_manager_after_promotion` when `italian_tl` is empty. Audit row `tl_link_cleared`.

## Risks
- Production data: people linked only through a team lose access at deploy. Mitigation: run the audit command,
  fix links (Users page bulk edit sets `albanian_tl`/`italian_tl`), then deploy. Local green does not prove this.
- Team leaders with no assigned employees see nobody (intended). Engagement rows for such leaders go empty.
- Branch `fix/team-scope-link-only` off origin/main; one PR per phase, squash merge after CI.
