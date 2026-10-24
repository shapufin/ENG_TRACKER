# Calendar group picker (2026-10-24)

**Primary goal:** an admin sets a team's calendar group by picking an existing
group (or naming a new one once), so a typo can no longer create a silent second
group. No access rule, schema or API changes.

## Facts verified (Phase 0)
- A group is only `Team.calendar_group` (CharField); groups match by exact string, writes normalised by `normalize_calendar_group` (`apps/users/models/core.py:170`).
- Access: `CalendarWorkspace.get_accessible_for_user` (`apps/dashboard/models/calendar.py:78`) and `my_teams_workspaces` (`apps/dashboard/viewsets.py:740`). Members see their teams, TLs see their managed members' teams, group peers see each other. Untouched.
- Only free-text entry points: `TeamFormDialog.tsx` (text + datalist) and the bulk input on `CalendarManagementPage`. `TeamEditDialog` already uses a `Select`.
- Data import `plugins/data_import/importers/teams.py` takes the string by column; unaffected (payload stays `calendar_group: string`).
- `TeamViewSet.members` (`apps/users/viewsets.py:1997`) expands to group teams but has NO frontend consumer; covered by `test_child_list_scope.py` and `test_perf_team_members.py`.
- Nav label `Calendar Sharing` appears only in `useAdminNavItems.ts:111` (no tests/e2e reference it).

## Phase 1: team form picker (TDD)
How it serves the goal: removes the typo path where groups are born.
- Test first: `components/admin/TeamFormDialog.test.tsx` (new): select lists groups with team counts, "No group" sends `""`, "New group..." reveals an input and sends the normalised name (`normalizeCalendarGroup`, `lib/calendarGroup.ts`).
- Replace the `FormField`+`datalist` in `TeamFormDialog.tsx` with `Select` (pattern: `TeamEditDialog.tsx:62-74`) plus a "New group..." item. Keep the `form.calendar_group` string contract so `useTeamsPageForm.ts` and the API payload are unchanged.
- Helper text: "Teams in the same group can see each other's calendars." (drops the unverified overtime/standby claim).
- Guards: no new dependency; no `max-w-*`/`dark:` classes; use control-kit `Select`.

## Phase 2: nav label
How it serves the goal: the page is a group manager, not per-user sharing.
- `useAdminNavItems.ts:111` label -> "Calendar Groups"; `TeamFormDialog` section title -> "Calendar group".

## Phase 3: docs
- `docs/workflow-invariants.md`: short "Calendar groups" section (string model, who sees what, `members` expansion is API-only and scoped by `_visible_member_user_ids`, do not add a Client FK).

## Verify
`npx vitest run src/components/admin src/pages/admin`, `npx eslint` on changed files, `npx tsc --noEmit`, `node scripts/control-audit.mjs`, `node scripts/modal-audit.mjs`; backend untouched so `manage.py check` only.

## Not now
Consolidating the other editors (they are different views: bulk, rename, per-team) · changing `members` expansion · Team->Client FK · wizard · removing `allowed_users`/`is_public`.
