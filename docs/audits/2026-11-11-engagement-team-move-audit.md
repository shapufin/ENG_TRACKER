# Engagement Team-Move & Partial-Team Audit (2026-11-11)

- **Branch:** `audit/engagement-scope-2026-11-11` (from `origin/main` `dfb26a3`)
- **Surface:** `plugins/engagement` ("My Engagement": `/engagement/metrics`, `/engagement/visualize`)

## Workflow Simulation Summary

| Scenario | Pre-fix behavior | Post-fix behavior |
|---|---|---|
| A. All users moved away, `Team.team_leader` still points to previous LM (no prior snapshot) | Created `(prev_LM, team)` row with `team_size=0`, `engagement_score=None` | No snapshot created (`team_count=0`) |
| B. All users moved away (`update_user`, `bulk_update`, `set_team_leader`, promotion) after current-month snapshot existed | Overwrote snapshot to `team_size=0` and kept showing team in `summary` & `team-breakdown` | Unfrozen snapshot pruned immediately; `summary` & `team-breakdown` drop the team |
| C. Frozen past-month snapshot exists, all users moved in current month | Frozen row shown with no transfer indication; future/current months showed `team_size=0` | Frozen row stays as history with `manager_changed=True` and `manager_changed_at` (`Changed manager · <date>` badge); current/future months omit the team |
| D. Partial team (1 of N members linked to LM1, others to LM2) | `team_size=1`, only linked member's requests/breaches/closure scored | Unchanged (verified OK) |
| E. 1-for-1 member swap in same team (`team_size` unchanged) | `stale_snapshot_ids` missed swap when incoming member's requests were older than `computed_at` | `member_ids` comparison detects swap and recomputes immediately |

## Findings & Fixes

1. **HIGH — Removed `Team.team_leader` (`led_teams`) from `candidate_leader_ids` and `leader_team_pairs`:** Enforces link-only internal data scope (`docs/workflow-invariants.md` item 64).
2. **HIGH — Pruned empty unfrozen snapshots and filtered `team_size__gt=0`:** Handled synchronously via `plugins/engagement/signals.py` (`raw=True`-guarded) and lazily in `_refresh`, `finalize_frozen_snapshots`, and `recompute_tl_metrics`.
3. **MEDIUM — Frozen `manager_changed_at` annotation:** Added `manager_changed_at` to `TLApprovalMetric` (migration `0007`), exposed `manager_changed` / `manager_changed_at` on `TLApprovalMetricSerializer`, and rendered a semantic warning badge in `TeamBreakdownTable.tsx`. Cleared automatically if a member is linked back; never stamped when a team is archived (`is_active=False`).
4. **MEDIUM — 1-for-1 member swap staleness:** Added `member_ids` (`JSONField`, excluded from serializer payload) to `TLApprovalMetric` and compared `sorted(member_ids)` in `stale_snapshot_ids`.
5. **Cross-component audit:** Verified `site_backup` (`raw=True` guard + `BackupCoverageGuardTests`), `test_row_ownership_matrix`, `team_lifecycle`, `tl_scorecard` (`ScorecardOverview`), `year_close`, `ticket_kpi`, `skills`, and `apps/users` move paths.

