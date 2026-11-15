# Audit handover: roles, role movement and long-term stability (2026-11-14)

For the implementing model (Sonnet). Read this file first, then open source only at the cited lines.
HEAD `beedc7b` on `main`. Nothing in the code, tests, migrations or database was changed by this audit.
Earlier rounds: `handover-full-audit-2026-11-13.md` (done), `docs/audits/leader-movement-2026-11-13/round-1.md` (done),
`docs/role-movement-checklist.md` (the standing checklist). Items closed there are not repeated here.

## 0. Baseline (measured today)

| Gate | Result |
|---|---|
| `py -3.14 manage.py test --parallel` | 4648 tests found, exit 0, system check clean |
| `npx tsc --noEmit` (frontend) | exit 0 |
| `npx vitest run` | ran to completion in 483 s, but the pass/fail summary line was not captured by this audit. Rerun before the first frontend PR and record the count |
| Browser, e2e, visual gates | NOT run. Every finding is code-level or API-level |
| Working tree | tracked files clean; about 50 untracked scratch files (see L6) |

How findings were proven: code read at the cited lines, a read-only delete dry run (`Collector.collect`) on the
dev database, and API probes inside a transaction that was rolled back. Probe scripts are not in the repo.

## 1. Verdict (answer to "is it solid, or do we need deep changes?")

1. No rewrite is needed. Scope and ownership rules are in a small number of functions, are heavily tested, and the
   leader-move work of 2026-11-13 closed the main gaps. The app can go to production after the two fixes in section 2.
2. Two defects must be fixed before go-live: deleting a user destroys history (C1), and a calendar-only team lead
   can approve their own overtime (H1). Both are proven, both are small fixes.
3. The long-term risk is not a bug, it is the shape: "what role does this person have" is answered from four
   places, and "is this person a leader" has five slightly different formulas (section 3). Today they agree
   because every write path keeps them in step. Each new role or new write path is a chance for them to disagree.
4. Adding a role today is a code change in about 20 places (section 4), not a data change. The database
   role-permission tables exist but almost nothing reads them. This is the main cost of the future PM role.
5. The reporting hierarchy is fixed at two levels in two columns (`albanian_tl`, `italian_tl`) with no dated
   history. A third leader level, or "who was the leader in March", cannot be answered from data (section 5).
6. Recommended path: fix C1 and H1 now; finish the half-done role migration next (S1, S2); add the role registry
   and guard tests when the next role is scheduled (S3, S4); build dated reporting lines only when a real
   requirement needs them (S5). Order and effort are in section 9.

## 2. Must fix before go-live

### C1. CRITICAL: deleting a user is a hard delete that cascades into history (FIXED 2026-11-14, merged PR #323 `b9462e9`)

- Where: `apps/users/viewsets.py:868-873` (`perform_destroy`) and `:875-958` (`bulk_delete`, `user.delete()` at `:943`).
- Fact: 43 foreign keys to `auth.User` are `CASCADE`. They include the person's own `OvertimeLog`, `StandbyLog`,
  `LeaveRequest`, `LeaveBalance`, `WageAssignment`, and records a leader wrote about other people or that are
  frozen history: `PIPRecord.tl`, `Meeting.organizer`, `Absence.flagged_by`, `IdleFlag.flagged_by`,
  `PromotionFlag.nominated_by`, `ReviewDelivery.leader`, `ScorecardMonthSnapshot.leader`,
  `TLApprovalMetric.leader`, `ApprovalPeriodCloseMember.user`.
- Only 6 keys are `PROTECT` (payroll line, payroll run entry, EPR stage record, HBPR evidence, HBPR assignment x2).
  A user with none of those is deletable. A closed year does not stop the cascade.
- Proof (dev database, dry run, nothing deleted): leader id 30 is deletable and the cascade holds 1 `PIPRecord`
  about another employee, 3 `TLApprovalMetric`, 1 `ScorecardMonthSnapshot`, 1 `StandbyLog`. Leaders 4, 11, 33, 66
  are deletable too and each loses a frozen scorecard snapshot or engagement rows.
- Why it matters: teams and clients are "archive, never delete" (items 30, 36). Users have no such rule, and
  the Users page offers Delete next to deactivate.
- Fix (smallest): one helper `user_delete_blockers(user)` in `apps/users/services/` that counts business rows
  (own requests, leave, wages, authored scorecard rows, snapshots, metrics, closure members, rows in a closed
  year). Both delete paths call it and answer 409 with the counts, same shape as the team archive `blockers`.
  A user with zero blockers (created by mistake) stays deletable. The UI message points to "Deactivate".
- Fix (defence in depth, separate commit, needs a migration): change the leader-authored and frozen-history
  keys above from `CASCADE` to `PROTECT`. Do not regenerate unrelated migrations.
- Test first: a leader with one `PIPRecord` about someone else and one snapshot row; `DELETE /users/{id}/` and
  `bulk_delete` both return 409/failed with blockers and every row still exists. A blank user is still deleted.
- Docs: new numbered item in `docs/workflow-invariants.md` ("users are deactivated, not deleted"), a Hot
  Invariant bullet in `CLAUDE.md`, a line in `docs/role-movement-checklist.md` section 3.

### H1. HIGH: a calendar-only team lead can approve their own overtime and standby (ON HOLD, owner 2026-11-14)

- Where: `apps/permissions/services/permission_service.py:120-134` (self-approval branch) reads
  `profile.is_team_leader`; `apps/users/models/core.py:674-695` makes that true for anyone who is
  `Team.team_leader` of an active team (`_leads_active_team`, `:440-448`).
- Rule broken: item 64 says `Team.team_leader` is calendar-only and "never grants internal data". The 2026-10-21
  ruling lets a real Line Manager or Manager decide their own overtime; it was never meant for this source.
- Proof (rolled back): a new user with no role, no legacy flag and no leader links was set as `team_leader` of
  an active team, created a pending overtime entry, and `POST /api/overtime/logs/{id}/approve/` returned 200 with
  `approved_by` = self. Approved overtime flows into payroll.
- Same predicate, same weakness: `IsTeamLeader` (`core/mixins/permissions.py:567-580`),
  `_validate_team_leader_access` (`:726-733`), `has_team_leader_role` (`:143-150`), `is_hr_only` (`:131`).
  These open leader endpoints (with an empty team scope) to a calendar-only lead.
- Fix: add one predicate `holds_leader_role(user)` = role codes or legacy role flags only (the formula
  `is_hbpr_only` already uses at `:175-179`). Use it for the self-approval branch and for the four call sites
  above. Leave `is_team_leader` for display and calendar reach. Owner decision D1 covers the "link target but
  no role" case.
- Test first: the probe above as a test in `apps/overtime/` (expect 403); a real Line Manager still gets 200;
  `team_pending` for a calendar-only lead returns 403.
- Docs: extend item 64 and the checklist rule 3 ("never use `is_team_leader` as an authority check").

## 3. Structural findings: one question, several answers

### S1. MEDIUM today, HIGH long-term: role identity has four sources

| Source | Written by | Read by |
|---|---|---|
| `UserRole` rows (authoritative by design) | `assign_role`/`revoke_role`, `_set_cr_admin_role`, superuser API | leader set, some list filters, `is_cr_admin` |
| `UserProfile.role_codes` JSON cache | signal `apps/permissions/signals.py:13-18` | `has_role`, all `is_*` properties, list filters, frontend `user.roles` |
| Legacy flags `is_hr_user`, `is_italian_tl_role`, `is_albanian_tl_role` | `_sync_roles`, `_sync_legacy_roles`, user form, importer | fallback in every `is_*` property, 221 hits in 23 files |
| Derived from other rows (someone's link points at you, or you lead an active team) | nobody, it is computed | `is_team_leader`, `is_italian_tl`, `is_albanian_tl`, `leader_user_ids` |

- Proof of split answers (rolled back): after the `hr` `UserRole` row was removed while the flag stayed,
  `has_role(user,'hr')` was False and `profile.is_hr` was True for the same user. Code that asks one helper
  refuses, code that asks the other allows (`can_approve` allows at `permission_service.py:143`).
- Reachable today only through the superuser role API (`apps/permissions/viewsets.py:167-178`), a restore, or a
  future write path that forgets the dual write. Dev database drift check found 1 row (`e2e-tl`: flag set, no role).
- `get_user_roles` (`role_service.py:15-25`) never reaches its database fallback: `role_codes` defaults to `[]`,
  never `None`. A stale cache is therefore trusted forever.
- Fix, in three commits, each with tests:
  1. Management command `check_role_drift` (read-only report, `--fix` backfills `UserRole` from flags). Run it
     in production before and after go-live. Add it to `docker/entrypoint.sh` as a report-only step.
  2. Make the `is_*` properties and `has_hr_role`/`has_team_leader_role`/`is_hr_only` read role codes only.
     Keep the flags as written-but-not-read for one release.
  3. Remove the flags from serializers, the user form, the importer and filters, then drop the three columns
     (migration; check backup/restore `PRIVILEGE_FIELDS` and the coverage guard test).
- Would break if: any test builds a leader or HR user by setting only the flag. Expect many fixtures to change;
  give them one factory helper instead of editing each by hand.

### S2. MEDIUM: role filters match substrings of a JSON string

- Where: `role_codes__icontains` at `apps/users/viewsets.py:314-337, 367, 398, 1418-1434, 1568-1633`,
  `apps/users/services/non_team_roles.py:28-31`, `apps/dashboard/admin_people.py:38-45`,
  `apps/dashboard/admin_overview.py:66-75`, `plugins/control_room/services/scope_service.py:163-165`.
- The code comments already admit the trap (`'admin'` matches `'cr_admin'`). It is safe only for today's six
  codes. A future code such as `hr_lead`, `pm_admin` or `sub_hr` silently lands in the wrong tab, count or scope.
- Fix: one helper `users_with_role_q(code, prefix='')` that filters on
  `user_roles__role__code=code, user_roles__is_active=True, user_roles__is_deleted=False` (works on SQLite and
  PostgreSQL), plus `.distinct()` where a join can duplicate rows. Replace every `icontains`. Do this after S1
  step 1 so the role rows are trustworthy.
- Test first: a role with code `xhr` assigned to a user must not appear in the HR tab, HR count or CR scope.

### S3. MEDIUM: five formulas for "is a leader", and duplicated constants

- `UserProfile.is_team_leader` (four sources), `has_team_leader_role` (same plus `has_role`), `is_hbpr_only`
  (roles and flags only), `leader_user_ids()` (active users, six sources, `leader_ownership.py:17-40`),
  frontend `isTeamLeader` (`computePermissions.ts:20-23`).
- `('italian_tl','albanian_tl')` is defined twice: `role_service.py:62` and `leader_ownership.py:14`.
- "Which roles lift a block" is written by hand in `is_hr_only` (`permissions.py:120-133`), `is_hbpr_only`
  (`:158-180`), `computeIsHBPROnly`, `computeIsHROnly`, `isEmployee`, and in each plugin manifest's
  `denial_override_roles` (`plugins/skills/plugin.py:44-45`, `plugins/ticket_kpi/plugin.py:44-51`,
  `plugins/engagement/plugin.py:43-44`; the engagement list differs from the other two).
- Fix: section 6 (role registry). Until then, H1's `holds_leader_role` plus importing one `TL_ROLE_CODES`.

### S4. MEDIUM: the database permission layer is mostly unused

- `HasPermission` (`core/mixins/permissions.py:550-564`) has no user. `permission_service.has_permission` is
  called from two places only: the `can_approve` fall-through (`permission_service.py:164`) and
  `plugins/data_import/importers/authority.py:45`.
- The fall-through passes `obj._meta.model_name` (for example `overtimelog`) with action `approve`. The 19
  permission rows on the dev database use modules `overtime`/`standby`/`leave` and actions such as
  `approve_team`, so no seeded row can ever match: the 25 role-permission rows are read by nothing that decides
  access. The one live effect is the `admin` role shortcut below, which makes the fall-through return True and
  skips team scope and the owner rule. Listed as an untested blind spot in the checklist.
- `has_role(user,'admin')` grants every non-protected capability (`:70`), but the `admin` role is assigned only
  by the e2e seed and is not in `MANAGED_ROLE_CODES`. Real admin authority is `is_staff`/`is_superuser`
  (118 inline checks against 37 calls to `is_staff_user()`).
- `UserRole.team` (team-scoped roles) is never set by any caller.
- Decision D2: either remove the fall-through and state that authorization is role predicates plus plugin
  grants (smallest, recommended), or commit to capability checks. Do not keep both half-alive.
- Test first (if removing): a role with an `approve` permission row cannot approve a row outside the owner rule.

## 4. What adding one role costs today (measured)

Counts are non-test source files. A new non-leader role (for example PM as an observer) touches rows 1-12 and
17-22. A new leader-type role touches every row.

| # | Place | Evidence |
|---|---|---|
| 1 | Seed migration for the `Role` row | `apps/permissions/migrations/0003`, `0006` are the patterns |
| 2 | `MANAGED_ROLE_CODES` (omitting a managed code from a `roles` list revokes it) | `user_creation.py:307` |
| 3 | `NON_TEAM_ROLES` | `non_team_roles.py:12` |
| 4 | Display name | `apps/permissions/display_names.py` |
| 5 | Does it lift the HR-only and HBPR-only blocks | `permissions.py:120-180` |
| 6 | Plugin manifests: `roles`, `denied_roles`, every `denial_override_roles` list | skills, ticket_kpi, engagement `plugin.py` |
| 7 | Users page tabs, the "employee" tab excludes each elevated role by name | `users/viewsets.py:1568-1633` |
| 8 | Admin dashboard people counts | `admin_people.py`, `admin_overview.py` |
| 9 | Control Room scope | `scope_service.py:163-165` |
| 10 | `UserSerializer` flags, JWT claims, login payload | `apps/users/serializers.py`, `views/auth.py` |
| 11 | Users importer role columns | `plugins/data_import` |
| 12 | Backup restore privilege fields and the coverage guard test | `plugins/site_backup` |
| 13 | Leader constants (two copies) | `role_service.py:62`, `leader_ownership.py:14` |
| 14 | A new link column on `UserProfile` and `leader_link_error` (two-way `if`) | `user_creation.py:314-334` |
| 15 | `get_team_member_ids`, `owned_by_leader_q`, `owner_leader_id` (fixed order: Line Manager, then Manager) | `models/core.py:623-640`, `leader_ownership.py:43-76` |
| 16 | Raw link lookups | 335 hits in 37 backend files |
| 17 | `computePermissions.ts` (roles, the "only" formulas, `isEmployee`, dashboards) | whole file |
| 18 | Nav `roles` union has five values; HBPR and CR are handled by special flags | `useVisibleNavItems.ts:38` |
| 19 | One route guard per restricted role | 7 guards in `components/auth/` |
| 20 | User form checkboxes, filters, badges | `useUsersPage.ts`, `UsersPageFilters.tsx:15`, `useUserColumns.tsx` |
| 21 | Hard-coded role strings | 219 hits in 48 frontend files |
| 22 | Role flag reads | 685 hits in 105 frontend files; 12 files read raw `user.is_*` and bypass `usePermissions()` |

## 5. Role movement and data links: state after yesterday's work

Holds (tested, do not re-audit): owner rule for overtime and standby, guarded and audited link writes, promotion
clears the Line Manager link, revoke is blocked while dependents or an open HBPR assignment exist, frozen months
and closed years do not move, payroll finalized runs do not move, HBPR scope by owner.

Still true and worth knowing:

| Id | Sev | Gap | Action |
|---|---|---|---|
| M1 | MEDIUM | Link history is audit text only (`leader_link_changed` rows). No dated table. Leave, payroll scope, skills, KPI and exports follow today's link, so a new leader sees the months before the move and the old leader loses them | Accept and document as the rule (D3), or build S5 |
| M2 | MEDIUM | Deactivating a leader has no guard or report. There is no `is_active` handling in `UserViewSet` beyond the generic PATCH. Pending rows fall to the Manager; with both leaders inactive nobody is notified and nobody can act except staff | `offboard_report(user)` shown before deactivate: dependents, pending rows they own, open HBPR assignments, led teams. Carried from round-1 backlog |
| M3 | MEDIUM | Superuser role API (`permissions/viewsets.py:144-178`) writes `UserRole` and deletes seeded `Role` rows with no guards: no legacy flag sync, no HBPR or dependents check, no Line-Manager-above-Line-Manager rule. Deleting a seeded role cascades every assignment | Route create/destroy through `assign_role`/`revoke_role` plus the two `find_blocked_*` checks; refuse deleting a seeded code |
| M4 | LOW | `update_user` takes no row lock; two admins editing one user can interleave | `select_for_update` on the profile at the top. Carried |
| M5 | LOW | `UserRole` `unique_together (user, role, team)` does not bind when `team` is NULL, which is every row | Partial unique constraint on `(user, role)` where `team IS NULL`; check for duplicates first (dev has 0) |
| M6 | LOW | Frontend `hasDatabaseRole` falls back to legacy flags only when `roles` is empty, the backend falls back per role. They can disagree for a flag-only HR user who has the `employee` role | Disappears with S1 |

Open rulings from `docs/role-movement-checklist.md` section 5 are unchanged (leave has no owner rule, promotion
history gaps, placeholder backup key accepted in production settings).

## 6. Target shape (do not build ahead of need)

- S5a, role registry (build when the next role is scheduled): one module, for example
  `apps/permissions/role_registry.py`, one entry per role: code, label, kind (base, leader, observer, scoped
  admin), `elevates` (lifts the "only" blocks), `has_personal_hours`, `link_field` or none. Derive from it:
  `MANAGED_ROLE_CODES`, `NON_TEAM_ROLES`, `TL_ROLE_CODES`, display names, `is_hr_only`, `is_hbpr_only`, the
  manifest override lists. A test asserts every seeded `Role.code` has a registry entry and the reverse.
- S5b, server-decided capabilities for the frontend: the user payload carries the derived booleans the registry
  computes (`is_hr_only`, `is_hbpr_only`, `can_approve`, home route). `computePermissions.ts` reads them instead
  of re-deriving. The organigrama plugin's `generatedMeta.ts` is the precedent for generated role metadata.
  Until then add one parity test: a JSON matrix of role combinations produced by a backend test and asserted by
  a vitest test against `computePermissions`.
- S5c, seam guard (cheap, do with S3): an AST or grep test, modelled on `core/test_business_today_guard.py`,
  that fails when a new file outside an allow-list filters on `italian_tl`/`albanian_tl` directly or calls
  `is_team_leader` for authority. This keeps the 335 raw lookups from growing.
- S5d, dated reporting lines (only on a real requirement such as a third leader level, a deputy, or "who led
  this person in March"): table `ReportingLine(employee, leader, kind, effective_from, effective_to)` written by
  the same guarded path that writes the two columns today; the columns stay as a denormalised "current" cache.
  This also closes item 73 (no promotion date). Not recommended now.

## 7. Hygiene, bloat, small leaks (LOW unless noted)

| Id | Item | Evidence | Action |
|---|---|---|---|
| L1 | Stale docstrings describe the pre-2026-11-10 three-source scope | `permission_service.py:113-118`, `core/mixins/permissions.py:738-742` | Rewrite to link-only; they will mislead the next change |
| L2 | `leader_user_ids()` (six-way OR with joins and DISTINCT) runs once per row in approve loops and once per notification | `permission_service.py:102-107`, `plugins/notifications/signals.py:54`; measured 14 queries for 10 `can_approve` calls | Resolve once per request inside the existing `actor_team_scope_cached` context. Optimisation, not a bug |
| L3 | Role CRUD methods in the frontend service have no caller | `frontend/src/services/permissionService.ts:65-156` | Confirm with fallow, then delete |
| L4 | 67 bare `except Exception:` in 33 backend files | 5 in `permission_service.py` are cache writes (fine) | Review the rest once for fail-open; `can_approve:158` logs and denies (fine) |
| L5 | Large files | `apps/users/viewsets.py` 2692 lines, `plugins/payroll/viewsets.py` 1548, `core/mixins/permissions.py` 1125 | Split `users/viewsets.py` by resource only when next touched; no behaviour change |
| L6 | About 50 untracked scratch files in the repo root and `frontend/` (`tmp-*.mjs`, `*.png`, `*handover*.md`, `db.e2e.sqlite3.bak-*`, `.audit_*.txt`) | `git status` | Owner deletes or ignores them; yesterday they broke the fallow CI step |
| L7 | 118 inline `is_staff or is_superuser` checks | grep | Use `is_staff_user()` in files as they are touched |
| L8 | `_set_cr_admin_role` writes with `.update()` and bypasses `assign_role`/`revoke_role` | `user_creation.py:465-489` | Works today (see disproved), but route it through the two helpers so there is one writer |
| L9 | Frontend unit suite takes 483 s; vitest reports jsdom was created 672 times, 53% of tracked time | vitest run output | Try `pool: "vmThreads"` in the vitest config (keeps per-file isolation), measure, keep only if the suite stays green |

## 8. Checked and disproved or passed (do not redo)

- `cr_admin` re-grant leaves `role_codes` stale: DISPROVED. Grant, revoke, re-grant all refreshed the cache.
- Staff can write roles through the role API: DISPROVED. List and retrieve are staff, writes are superuser-only.
- `can_approve` has an N+1 on team members: DISPROVED. About one query per row (see L2 for the remaining one).
- `UserRole` duplicates for one user and role: none on the dev database.
- Passed yesterday and not re-read: owner rule parity, leader-link guards, HBPR scope, restore privilege
  confirmation, session limit, payroll finalize inputs.

Not covered by this audit: browser behaviour of any page, export file contents, payroll PDF/Excel, push
delivery, production settings and deploy config, load behaviour, the e2e suite. Section 4 counts are greps and
are upper bounds (some hits are labels or comments).

## 9. Owner decisions, then order of work

**Status at 2026-11-14 (end of day), read this first.** Merged to `main`:
- PR #323 (`b9462e9`): C1, deactivate-not-delete plus the superuser erase override.
- PR #324 (`fc84193`): S1 step 1 (`check_role_drift`, read-only, `--fix` backfills), D2 (no capability fall-through in `can_approve`), M5 (partial unique constraint, migration `0008`), the managed-role delete guard, the M2 post-save warning.
- PR #325 (`c2e81e6`): S2 (`users_with_role_q` replaces every `role_codes__icontains`), M3 (role API create/delete through `assign_role`/`revoke_role`, no PUT/PATCH), S5c (`core/test_leader_seam_guard.py` ratchet).
- PR #326 (`82fc950`): S1 step 2. Every production read of the three legacy flags now comes from the `UserRole` grant.
- PR #327 (open, CI running at time of writing): S1 step 3. The three columns are dropped (migration `users.0029`); the write paths, the profile API (read-only derived values), the restore list and `check_role_drift` are updated.

Still open:
- S1 step 3 is in PR #327 (merge when CI is green).
- Hygiene PR (branch `chore/hygiene-l1-l3-l8`): L1 stale orphan comment fixed; L3 uncalled role/role-permission methods removed from `permissionService.ts`; L8 CR-admin writer routed through `assign_role`/`revoke_role`. Open: L2, L4, L5, L6 (scratch files, owner), L7, L9.
- M2: DONE (branch `feat/m2-offboard-confirm`): the Django admin user form lists what a deactivation leaves behind and refuses to save until `confirm_offboarding` is ticked. Reactivation and plain users are not gated. The old post-save warning is removed.
- Done in the hardening PR (branch `fix/role-hardening-m4-s3-m6`): M4 (profile row lock in `update_user`), S3 (engagement and tl_scorecard use the leader_ownership constant), M6 (frontend role helper is grant-only).
- S5a, S5b, S5d: deferred until the next role is scheduled.
- L2 to L9: hygiene, not started.
- H1: ON HOLD by owner ruling. Do not change.
- PROTECT migration for leader-authored history: dropped by owner decision (erase must still remove them).
- Production: `check_role_drift` reads zero (confirmed). Duplicate team-less `UserRole` rows before migration `0008` were not checked on production; confirm with a query before that migration runs.

Decisions recorded: D1 not a leader for authority (drift report); D2 fall-through removed; D3 leave, payroll and exports follow the current link; D4 deletes only with zero business rows, plus the superuser erase.

Decisions to get before coding:
- D1. A user with no leader role whom someone's link still points at: leader or not? (The link guard refuses new
  such links, so this is legacy data only. Recommended: not a leader for authority; the drift command reports them.)
- D2. Remove the unused database capability fall-through (recommended) or commit to it (S4).
- D3. Confirm "leave, payroll scope and exports follow today's link" as the permanent rule, or ask for S5d.
- D4. C1: is "zero business rows" the only case where a user may be deleted? (Recommended: yes.)

Order (one branch and PR per step, TDD, targeted tests while iterating, full suite once at the end of each):
1. C1: DONE (PR #323), merged to `main` as PR #323 (`b9462e9`, CI green; 20 targeted tests pass on `main`). Ordinary deletes refuse with blockers; a superuser-only erase override exists (preview, typed phrase, reason, audit row, notice to all superusers; never erases PROTECT rows or closed years). Full rule: `docs/workflow-invariants.md` item 83. Owner rulings 2026-11-14: D4 answered (yes, plus the override); no scheduled or bulk erase. Still open: the `PROTECT` migration for leader-authored history as its own PR, and M2 (offboard report before deactivation).
2. H1: ON HOLD. Owner ruling 2026-11-14: leaders may approve their own entries for now; do not change this until the owner says so.
3. S1 step 1 `check_role_drift`; run it against a production copy and attach the output to the PR.
4. M3 guarded role API: DONE (PR #325). M5 constraint: DONE (PR #324). L1 docstrings and L8 single writer: OPEN.
5. S2: DONE (PR #325).
6. S1 step 2: DONE (PR #326). S1 step 3 (write paths, columns dropped): OPEN.
7. S5c seam guard test, S3 single constant, M2 offboard report.
8. Later, when the next role is scheduled: S5a registry, S5b capabilities or parity test.

Gates for every PR: `py -3.14 manage.py makemigrations --check`, the role-movement test list in
`docs/role-movement-checklist.md` section 4, `py -3.14 manage.py test` (baseline 4691), `python -m ruff check`,
and for frontend changes `npx tsc --noEmit`, `npx vitest run`, `npm run build`. Doc sync is part of each PR:
`docs/workflow-invariants.md`, `CLAUDE.md` Hot Invariants and router, `docs/role-movement-checklist.md`.

Method for the implementer: use trace `get_change_impact` on `UserProfile.is_team_leader`, `UserViewSet.bulk_delete`
and `PermissionService.can_approve` before editing; quote the line you are changing; write the failing test first;
never weaken an existing test to make a change pass.
