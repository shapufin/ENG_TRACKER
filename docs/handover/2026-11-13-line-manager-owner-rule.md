# Handover: one owner for overtime and standby (Line Manager changes)

For: Sonnet 5.5 (implementation, maintenance). Date: 2026-11-13. Rule ref: `docs/workflow-invariants.md` item 82.

## 1. The problem and the ruling
- Before: approval was stored with the approver (`approved_by`), but exports, team queues, the scorecard, engagement and year-close placed rows by the employee's *current* Line Manager. A moved employee's decided rows went to the new leader, and the old leader lost their own decisions.
- Owner ruling (Option A): a decided row (approved or rejected) belongs to the leader who decided it, while that person is a leader. Every other row (pending, decided by staff or a non-leader, or with no approver) belongs to the employee's current leader.
- Leave, payroll and user-level year-close files are NOT changed. They still follow the current link.

## 2. The rule in code (one definition, two twins)
- `apps/users/services/leader_ownership.py`:
  - `leader_user_ids()`: who counts as a leader (role, legacy flag, link target, team lead).
  - `owned_by_leader_q(leader_id)`: database form, used by queries.
  - `owner_leader_id(...)`: Python form, used by year-close.
  - `owner_team_id(leader_teams, employee_teams)`: one team per row.
- The two forms must agree. `apps/users/tests_app/test_leader_ownership.py::LeaderOwnershipTests::test_python_owner_matches_the_queryset_owner` checks this. If you change one, change the other and extend that test.
- Owner tie-break: an employee with both links is owned by the Line Manager (`albanian_tl`), else the Manager (`italian_tl`).

## 3. Where it is used
- Leader queues: `core/mixins/permissions.py::_filter_owned_by_leader`, used by overtime and standby `team_logs`, `team_pending`, `team_pending_months`.
- Scorecard overtime turnaround: `plugins/tl_scorecard/services.py` (`TrendWindow`, `ot_turnaround_metrics(leader_id, ...)`).
- Engagement: `plugins/engagement/services.py` (`owned_scopes`, `owned_row_ids_by_team`, `compute_tl_metric(..., owned=None)`, `leader_team_pairs` now includes the leader's own teams and the teams where they decided someone this month).
- Engagement visibility: `plugins/engagement/viewsets.py::_base_queryset` serves rows with members OR submitters.
- Engagement staleness: `plugins/engagement/services.py::stale_snapshot_ids` (`decision_touched`).
- Year-close readiness warning: `plugins/year_close/services/readiness.py` (Unassigned row count).
- Year-close: `plugins/year_close/services/builder.py` (`ot_standby_rows_by_bundle`, `bundles_for_year` with `ot_ids`, `completeness_gap` per row, `_querysets_for(year, member_ids, row_ids)`).

## 4. Behaviour changes to tell the owner
- A leader's own overtime no longer appears in their own team view. It appears in their leader's view. This prevents the same row being listed by two leaders.
- Engagement overtime and standby numbers: decisions stay with the approver. Pending and submitted rows follow the current leader.
- Year-close: overtime and standby sheets are split by owner. A bundle can now hold rows of an employee whose user-level files are in another bundle.
- The scorecard overtime block counts only decided rows the leader owns.
- Frozen months (scorecard, engagement) are not touched by this change.

## 5. Verification done (2026-11-13)
- Full backend suite: 4484 tests OK (the earlier 4490 counted some tests twice, through subclassing, which was removed). Ruff clean on `apps plugins core config`. Frontend: `TeamBreakdownTable.test.tsx` 9 of 9 pass; eslint and tsc clean.
- Situation matrix: `apps/overtime/test_owner_simulation.py` (prints `SIM|` lines). Cases: decided before a move, pending at a move, decided by staff, demoted approver, Manager plus Line Manager, move to nobody, team-only change, leader's own rows, standby, engagement and year-close after a move, employee in two teams.
- Browser simulation (local e2e database, not committed): old leader's team view shows only their approved 2h row after the move; new leader's shows only the pending 3h row. Old leader's My Engagement shows their 100% approval, 24h average and team size 0. New leader's shows no data for the approved decision. Before this rule, the new leader showed 100% approval for the old leader's decision.
- Year-close check: old leader's bundle holds the approved overtime and standby; new leader's bundle holds the pending overtime.

## 6. Files changed (branch `fix/lm-reassignment-owner-rule`, NOT committed)
- Code: `apps/users/services/leader_ownership.py` (new), `core/mixins/permissions.py`, `apps/overtime/viewsets.py`, `apps/standby/viewsets.py`, `plugins/tl_scorecard/services.py`, `plugins/tl_scorecard/test_tl_scorecard.py`, `plugins/engagement/services.py`, `plugins/engagement/viewsets.py`, `plugins/year_close/services/builder.py`.
- Tests (new): `apps/users/tests_app/test_leader_ownership.py`, `apps/overtime/test_lm_reassignment_scope.py`, `apps/overtime/test_owner_simulation.py`, `plugins/tl_scorecard/test_owner_rule_scorecard.py`, `plugins/engagement/test_owner_rule_engagement.py`, `plugins/year_close/test_owner_rule_bundles.py`.
- Frontend (new in review): `frontend/src/plugins/engagement/components/TeamBreakdownTable.tsx` ("Moved away" label) and its test.
- Changed expectation: `plugins/engagement/test_team_moves.py::test_one_for_one_member_swap_detects_staleness_and_recomputes` (the leader keeps the decision made before the swap; score 75 instead of 0).
- Docs: `docs/workflow-invariants.md` (item 82), `docs/team-lifecycle.md` (move table, open note resolved), `docs/engagement-metrics.md`, `CLAUDE.md` (hot invariant and router row), this file.
- Do NOT commit these local-only files: `config/settings_sim.py`, `frontend/vite.sim.config.mts`, `frontend/node_modules/`, `db.e2e.sqlite3`, `db.e2e.sqlite3-shm`, `db.e2e.sqlite3-wal`.

## 7. Known limits and the senior decisions taken (review this section first)
Decisions (2026-11-13, see item 82 (g)):
- Stale snapshots: FIXED. A late decision by a leader marks that leader's snapshots stale (test `test_a_late_decision_by_a_leader_marks_their_snapshot_stale`).
- Leader with no team: FIXED for engagement. A leader's own teams and the teams where they decided someone become their teams. A team row with size 0 and submitters is shown as "Moved away" (frontend test `TeamBreakdownTable.test.tsx`).
- Row with no owner team: DECIDED. It goes to Unassigned and the year-close readiness warns with the count (test `test_rows_without_an_owner_team_are_named_in_the_readiness_warnings`). It is not in engagement; that is accepted because the employee has no team to show it in.
- Demoted approver: DECIDED to keep the current rule. Ex-leaders have no team view, so their history follows the employee's current leader.
- Leave ownership: DECIDED NOT to change now (person-based balances). Own ruling needed later.
- `leader_user_ids()` cost: ACCEPTED (one query per call).
Remaining limits as the reviewer should know them (the first two are by decision, not bugs):
- A decision whose employee has no team at all is not in any engagement snapshot (decided, see section 7).
- Year-close rows with no owner and no leader link fall back to the user's own bundle (the old behaviour); rows with an owner but no team go to Unassigned and the close warns. Check the warning after each close.
- `leader_user_ids()` runs one query per call. The engagement and year-close loops call it once per leader or once per run, not per team.
- Owner logic is row-level for overtime and standby only. A future request type with approvals needs the same rule added deliberately.

## 8. Open backlog (needs an owner ruling before any change)
- Leave ownership by decider: same field, different balances. Decide before touching leave.
- Demoted-approver history: confirmed as the current rule; ask the owner only if an ex-leader must keep sight of history.
- Cache `leader_user_ids()` per request, only if the engagement page becomes slow (measure first).

## 9. How to maintain this
1. Any change to who a leader is: change `leader_user_ids()` and `owned_by_leader_q` together, keep `LeaderOwnershipTests.test_python_owner_matches_the_queryset_owner` green, and update item 82.
2. Any new leader-facing overtime or standby read: use `owned_by_leader_q` (or the `_filter_owned_by_leader` mixin). Never filter by `user_id__in` of team members for approvals or export.
3. Any new team-based metric that sums over teams: assign each row to one team (`owner_team_id`). Never count the same row in two teams.
4. After a change, run: `py -3.14 manage.py test apps.overtime apps.standby plugins.engagement plugins.tl_scorecard plugins.year_close apps.users`, then the full suite once, then `python -m ruff check` on changed files.
5. To reproduce the browser simulation: seed `apps/overtime/test_owner_simulation.py`-style data into a local e2e database (never `db.sqlite3`), run a backend and a frontend on free ports, and check the three pages above.

## 10. Commit and review
- Review the diff against `main`, then commit with an English conventional message only when the owner asks. Do not push without a request.
- Ask the owner to rule on the backlog in section 8 before any change to leave ownership.
- Reviewer checklist: (1) read section 2 and the parity test; (2) run the tests named in section 9; (3) check the "Moved away" label in the browser for a leader whose team is empty; (4) check the Unassigned warning text on a close with an owner-less row.
