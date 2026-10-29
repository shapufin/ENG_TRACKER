# Pure-HR isolation and /hr/team-leaders cleanup

## Primary goal

A user who is only HR sees a sidebar and dashboard that contain what HR actually does (approvals, holidays, reports, TL assignment, skills catalog) and nothing empty or misleading, while every multi-role user (TL+HR, Admin+HR, HBPR+HR, CR+HR) keeps exactly the access they have today. On `/hr/team-leaders`, HR sees only the people it can assign a TL to.

## Decisions (user, 2026-10-29) — supersede the Phase 0 recommendations

- HR has no overtime, standby or team calendar: hidden, route-bounced and refused by the API.
- Ticket KPI: removed for pure HR (nav, routes, API).
- Skills: pure HR sees Team Skills, cannot edit ratings; catalog `manage` stays with HR.
- `/hr/team-leaders`: plain employees only, staff/superusers excluded (`assignable_employee`).
- Shipped on branch `fix/hr-isolation`.

## Branching and scope rules

- One fresh branch off `main` per phase (`fix/hr-isolation-<phase>`). Current branch `feat/admin-payroll-gui-modernization` has uncommitted payroll work from another stream: do not touch `frontend/src/plugins/payroll/**` or `/hr/payroll/wages`.
- TDD: failing test first, then the smallest diff. Targeted tests while iterating, full pass once at the end of each phase.
- Frontend `isHROnly` must equal backend `is_hr_only` (`core/mixins/permissions.py:120`): HR (role or `is_hr_user`) AND NOT staff AND NOT superuser AND NOT TL (role `italian_tl`/`albanian_tl` or `profile.is_team_leader`). It does NOT look at hbpr/cr_admin, so HBPR+HR and CR+HR are still "HR only" by the backend definition. Decide per surface whether that is intended (see Phase 1 question).

## Findings from verification that change the audit

| Audit claim | What the code says | Consequence |
|---|---|---|
| Hide Overtime/Standby from HR, deny in backend | `OvertimePage.tsx:28,152,202` and `useOvertimeColumns.tsx:13` give `canApprove` (includes HR, `computePermissions.ts`) approve/reject actions. `HRReadOnlyMixin` (`core/mixins/permissions.py:588`) says HR "can still approve/reject" and view all. | HR approves from `/overtime` and `/standby`. Removing the nav item removes HR's approval surface. Backend denial would break approvals. **Do not deny in the backend. Do not hide the nav item** unless a replacement approval page for HR exists (none found under `pages/hr/`). |
| Hide Skills from pure HR | `plugins/skills/plugin.py:32-48`: `view` roles include `hr`; `manage` is `["hr"]` (HR owns the skill catalog). `SkillsSidebarItem.tsx:25` shows Team Skills to HR. | HR needs Skills. At most hide "My Skills"/"Skill History" (personal). Needs product answer. |
| Hide Ticket KPI from pure HR | `plugins/ticket_kpi/plugin.py:42-52`: `hr` is in `denial_override_roles` for `view` and `manage`. | Deliberate HR access. Needs product answer before any change. |
| Hide Calendar from pure HR | `AppRoutes.tsx:154` wraps `/calendar` in `HbprRestrictedRoute` (HBPR-only bounce). HR has no team workspace so the page can be empty. | Safe candidate: bounce pure HR to `/hr/calendars` (holidays). Verify empty state first. |
| Personal dashboard tab for pure HR is empty | `computePermissions.ts:93-98`: `employee` dashboard is pushed unless HBPR-only. | Safe candidate: omit `employee` when pure HR. |
| `role:"employee"` leaves only employees | `apps/users/viewsets.py:1392-1459`: the `employee` filter intentionally keeps Django staff/superusers and users who lead a `Team` row; excludes `hr`, `hbpr`, `cr_admin`, TL roles. | Superusers/staff still appear. Needs a decision (Phase 3). |
| Empty "Leadership" header from role gating | `SidebarNav.tsx:39-72`: the section label always renders; `<PluginSlot slot="sidebar-nav" section=...>` renders inside. `hasInjectedItems` is computed (line 46) but the label does not use it. | Rendering bug, not role bug. Fix by not rendering the label when the section has no flow items and the slot renders nothing. |

## Phase 0: Documentation discovery (done) and open product questions

**How this serves the primary goal:** it stops us shipping a "fix" that removes HR's approval, skills-catalog or KPI access.

Allowed APIs and locations (all verified by reading):
- `computeRoles`/`computeBasePermissions`/`computeDashboards`/`computeIsHBPROnly` in `frontend/src/context/computePermissions.ts`. `computeIsHBPROnly` (line ~58) is the template for `computeIsHROnly`. `PermissionContextType` lives in `context/permission-context-base`.
- Route guard templates: `components/auth/HoursRoute.tsx`, `components/auth/HbprRestrictedRoute.tsx` (+ their `.test.tsx`).
- Nav: `components/layout/hooks/useVisibleNavItems.ts` (`allNavItems`, filter at lines 224-239, `hbprHidden` flag); `components/layout/SidebarNav.tsx`.
- Backend: `is_hr_only`, `HRReadOnlyMixin`, `HbprBlockedMixin` in `core/mixins/permissions.py`; plugin denial via manifest `denied_roles`/`denial_override_roles`.
- TL assignment: `pages/hr/hooks/useHRTeamLeaderAssignment.ts`, `pages/hr/HRTeamLeaderAssignmentPage.tsx` (182 lines, already uses `PageShell`, `DataTable`, `BulkActionBar`), `userService.getProfiles`, `userService.getTechFacets`.

Anti-patterns: no `isHROnly` exists in `frontend/src` yet (grep returned nothing); do not assume it. Do not add a pure-HR deny to overtime/standby/ticket_kpi/skills viewsets. Do not use `dark:` colours or raw palette values (control kit). `cn` is tailwind-merge: compose, do not append class strings.

Questions for the user before Phase 2 (answer in chat):
1. Should HR keep `/overtime` and `/standby` as their approval screen? (Recommended: yes, keep both.)
2. Skills: hide only "My Skills"/"Skill History" for pure HR, keep "Team Skills" and the catalog? (Recommended: yes.)
3. Ticket KPI: keep as is since the manifest grants HR access, or restrict? (Recommended: keep.)
4. `/hr/team-leaders`: must superusers/staff be excluded? (Needs backend change, see Phase 3.)

## Phase 1: `isHROnly` helper (frontend only)

**How this serves the primary goal:** every later phase needs one exact definition of "pure HR" that never strips a multi-role user.

Implement:
- In `computePermissions.ts` add `computeIsHROnly(roles)` next to `computeIsHBPROnly`: `isHR && !isAdmin && !isSuperuser && !isItalianTL && !isAlbanianTL && !roleFlag(user,"is_team_leader")`. `computeRoles` does not expose the legacy `is_team_leader` separately from `isTeamLeader`, so use `!isTeamLeader` (it already ORs the flag). Return it from `computeBasePermissions` as `isHROnly`; add the field to `PermissionContextType` in `permission-context-base`.
- Tests first in the existing `computePermissions` test file (find with `find frontend/src/context -name "computePermissions*.test.*"`): pure HR true; HR+italian_tl, HR+albanian_tl, HR+is_team_leader flag, HR+staff, HR+superuser false; non-HR false; HBPR+HR true (matches backend; assert it explicitly); roles array empty falls back to legacy `is_hr` flag.
- Add a parity test comment pointing at `apps/users/tests_app/test_permissions.py` for the backend cases.

Verify: `cd frontend && npx vitest run src/context && npx eslint src/context && npx tsc --noEmit`.
Guard: do not change `isHR`, `isEmployee`, `canApprove`.

## Phase 2: Sidebar, routes and dashboard (answers to Phase 0 questions decide the exact list)

**How this serves the primary goal:** removes the empty and personal-only surfaces pure HR sees, without touching surfaces HR works in.

Default scope if the recommended answers hold:
1. **Dashboard switcher**: in `computeDashboards`, skip `"employee"` when `isHROnly` (pure HR gets `["hr"]` only; `DashboardSwitcher.tsx:27` already hides itself at length 1). Test in the permissions test file. Check `useDashboardData` never reads `employee` data for pure HR when `selectedDashboard === "hr"`.
2. **Calendar**: nav item `/calendar` gets a `hrOnlyHidden` flag (new, mirrors `hbprHidden`) and the route bounce goes to `/hr/calendars`. Prefer a new tiny `HrRestrictedRoute` modelled on `HbprRestrictedRoute.tsx` (copy, change predicate and target) over editing `HbprRestrictedRoute`, whose tests pin HBPR behaviour. Wire in `AppRoutes.tsx` near line 154. Tests: pure HR redirected; HR+TL passes; employee passes.
3. **Leadership label**: in `SidebarNav.tsx`, render `SidebarSectionLabel` only when the section has flow items or the injected slot yields something. `hasInjectedItems` (line 46) is metadata-based and is true for every user, so it is not enough: render the label from inside a wrapper that knows whether `PluginSlot` produced children (check `PluginSlot` API first; if it cannot report emptiness, add an optional `onEmpty`/render-prop only if no simpler option exists). Test in `SidebarNav.test.tsx` with pure HR (no leadership items, slot renders null).
4. **Skills** (only if Q2 yes): `SkillsSidebarItem.tsx` hides "My Skills" and "Skill History" for `isHROnly`, keeps "Team Skills". Do not touch `plugins/skills/plugin.py`.
5. Overtime, standby, Ticket KPI: no change unless the answers to Q1/Q3 say otherwise.

Verify: `npx vitest run src/components/layout src/components/auth src/context`, then live check with CloakBrowser/Browser as a pure-HR, an HR+TL and an employee account: sidebar contents, `/calendar` redirect, no console errors, light and dark, 375px. State plainly if the browser was not available.
Guards: no `dark:` colours; no backend change; multi-role matrix tests must exist for every new predicate.

## Phase 3: `/hr/team-leaders` employee-only list

**How this serves the primary goal:** HR sees only people it can assign a TL to.

Implement:
- Tests first in `pages/hr/hooks/useHRTeamLeaderAssignment.test.tsx`: `getProfiles` and `getTechFacets` are called with `role: "employee"`.
- In `useHRTeamLeaderAssignment.ts` pass `role: "employee"` to both calls and add `"employee"` to the profile query key (React Query keys must include every result-changing parameter).
- Confirm `userService.getTechFacets` and `tech_facets` (`apps/users/viewsets.py:1461`) accept `role` (the docstring says facets are scoped by the active role tab). Verify with `get_symbol`/read before coding.
- Backend decision (Q4): if staff/superusers must be hidden, add a test in `apps/users/tests_app/` that an HR user listing with the HR assignment scope never receives staff/superuser profiles, then add the narrowest filter (new `role` value or a scope flag); do not alter the `employee` tab semantics used by the Admin Users page (comment at `viewsets.py:1440` and `docs/hbpr-and-scorecard.md` document why).
- Check that HR can still set a TL for a user whose list row disappears (no dangling selection: `rowSelection` must clear on filter change per the interaction baseline).

Verify: `py -3.14 manage.py test apps.users.tests_app.test_permissions` (+ the new backend test), `npx vitest run src/pages/hr`.
Guards: do not widen HR write access; `setTeamLeader` stays the only writer.

## Phase 4: `/hr/team-leaders` visual refresh (optional, separate PR)

**How this serves the primary goal:** same page, easier to scan; it does not change who can see or do what.

Implement by copying existing patterns, not inventing components:
- Stat cards: reuse `StatCard` (see admin dashboard / Users page usage); real counts only (total employees, with Italian TL, with Albanian TL, unassigned), derived from the loaded list so they match the table.
- Name column: reuse `UserCell` (`h-7 w-7` avatar).
- Keep `PageShell`, `DataTable`, `BulkActionBar` as they are (flat `bg-muted/40` strip, gradient count badge).
- Honour `docs/table-header-contract.md` and `docs/ui-control-kit.md`.

Verify: `cd frontend && node scripts/table-header-audit.mjs && node scripts/control-audit.mjs && node scripts/surface-audit.mjs`, vitest for the page, light/dark captures, 375px.
Guard: no new dependencies, no inline header typography.

## Final phase: verification

**How this serves the primary goal:** proves the multi-role matrix is intact and the pure-HR view is clean.

- Matrix test run: pure HR, HR+TL, HR+admin, HR+superuser, HBPR+HR, CR+HR, employee, TL; assert sidebar items, dashboards, route access for each.
- Greps: `grep -rn "isHROnly" frontend/src` shows only intended uses; `git diff --stat` touches no `plugins/payroll` file.
- Full pass once: `py -3.14 manage.py check`, targeted `manage.py test apps.users apps.permissions`, `cd frontend && npx tsc --noEmit && npx vitest run && npm run build`, `python -m ruff check --output-format=concise <changed .py>`.
- Update `docs/workflow-invariants.md` (HR admin-panel isolation) and the CLAUDE.md Hot Invariants only with decisions actually shipped.
