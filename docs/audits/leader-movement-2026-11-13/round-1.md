# Audit: leader and role movement (round 1), 2026-11-13

Scope: Line Manager / Manager changes, promotion, demotion, team moves across core, permissions,
plugins, payroll, backup, exports and HR. Base: main 3c2d14e (after PRs #318-#320). Baseline: 4631 backend tests.

## Resolved (branch audit/leader-movement-2026-11-13)
| Finding | Sev | Fix |
|---|---|---|
| Profile PATCH wrote leader links, role flags, teams with no guards | High | Fields read-only in `UserProfileSerializer`; writes only via guarded paths |
| Importer deferred links used bare `setattr` | High | `finalize_batch` uses the shared guard + audit |
| Link target never checked (role, active) outside one view | High | `leader_link_error` in `user_creation.py`, used by every write path |
| Self-link and circular links accepted | Medium | Same helper |
| Link changes never audited; `bulk_delete` cleared links silently | Medium | `leader_link_changed` / `leader_links_cleared` audit rows |
| Restore could change links without privilege confirmation; no cache refresh | Medium | Links in `PRIVILEGE_FIELDS`; `refresh_after_restore()` |
| `cr_admin` revoke left permission cache stale | Medium | `invalidate_permission_cache_for_user` after `.update()` |
| Control Room scope included archived teams | Medium | `team__is_active=True` in all scope queries |
| HBPR lost a Line Manager's records after the employee moved; `tl_sync` hidden | Med-High | Slice is by owner Line Manager (ruling 2026-11-13); one-on-ones still excluded |
| Scorecard freeze job kept its own leader definition | Low | Uses `leader_user_ids()` |
| "TL-Italy syncs" wording; stale docstring | Low | "Manager syncs"; docstring fixed |
| Stale lists after an admin move | Low | `invalidateLeaderScopedQueries` |

## Decided, no code change
- Reports "top leaders" ranks by the CURRENT Manager's team hours (team load), not by decider. Intentional; do not read it as an approvals ranking.

## Deferred backlog (revisit when the area is next touched)
- Organigrama drops an employee whose only link is a deactivated or demoted Line Manager (needs an "Unassigned" node and UI).
- `update_user` has no row lock (two admins editing one user can interleave).
- `revoke_role` default `team=None` would never revoke a team-scoped role (no such role exists yet).
- No alert when both linked leaders are inactive (owner-only notifications reach nobody).
- No sweep or admin count for "active member, inactive leader".
- Open rulings in `docs/role-movement-checklist.md` section 5 (leave ownership, team-leave without link change).

## Scorecard
| | Round 1 |
|---|---|
| Findings reported | 8 plugin + 12 backend |
| Confirmed and fixed | 12 (3 High) |
| Decided without change | 1 |
| Deferred | 5 |
| Disproved | 0 (two were only partly verified in code; tests now pin them) |
| Backend tests | 4631 -> 4648 |

Round 2 (a fresh read-only re-audit of the same scope) has not been run.
