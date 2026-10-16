# Admin Users overhaul (2026-10-15)

**Primary goal:** An admin can find any user in seconds at any headcount, create one without a scrolling form or guesswork, and the Users page opens light.

Evidence (measured on e2e DB + 600 synthetic users, `db.e2e.sqlite3`, throwaway): list = 605 profiles, server sends first 200 (269 KB, 17 queries, ~390 ms); search/filter run client-side on those 200 only, so `bulk000` returns "0 results"; CR badge request sends 200 ids, backend caps at 100, returns 400, swallowed by `.catch`; create errors are toast-only; table starts at y=778 on a 768px screen.

## Phase 0: Discovery (read before coding)
*Serves goal:* stops us inventing a pager or search API the table cannot use.
- Read `components/ui/DataTable.tsx`: does it support manual/server pagination, server sorting, controlled search? List exact props.
- Read `UsersPageFilters.tsx`, `UserStatsCards.tsx`, `UserFormCore.tsx`, `services/user_creation.py:create_user_with_profile`, `lib/error-handler.ts`, `hooks/useFormErrorHandler.ts` (reuse for inline errors).
- Check `docs/table-header-contract.md`, `docs/ui-control-kit.md` (gates apply). Anti-patterns: new deps, per-call-site table header/field styling, new `defaultAdminLayout` widgets.

## Phase 1: Server-side search + paging (the correctness bug)
*Serves goal:* "find any user" is false today.
- `UserProfileViewSet`: add first/last name to `search_fields`; keep `UserProfilePagination` (page_size 50 default, max 200).
- Frontend `useUserManagement`: put `page`, `search` (debounced) in the query key; `keepPreviousData`; `DataTable` manual pagination + controlled search (per Phase 0).
- Test first: backend list `?search=bulk000&page=` finds user 400+; vitest: typing search refetches.
- Guard: never filter a server page client-side (same rule as HBPR evidence).

## Phase 2: Slim list payload + fewer requests
*Serves goal:* page opens light.
- New `UserProfileListSerializer` (id, name, email, flags, team names, tech names/levels, TL names, roles); full serializer stays for detail/edit. Drop duplicated `user.team(s)`, `teams_detail`, `clients_detail` from list.
- Detail panel/edit dialog fetch `profiles/{id}/` on open (UserDetailPanel currently reads the list row, per the v3 invariant: update that invariant in CLAUDE.md).
- Fold `stats` + `tech_facets` into one cached call or lazy-load facets when the Tech row is opened; drop the 4 TL/teams/techs reference calls to `staleTime` + shared keys. Test: `assertNumQueries` on list.
- Fix CR badge: chunk ids <=100 or move to `?include=cr_access` server-side. Test: 200-row page shows badges, no 400.

## Phase 3: Compact page chrome
*Serves goal:* table visible without scrolling.
- Replace 5 stat cards (330px) with one slim strip (Total / Italian TL / Albanian TL / No TL / Active today); single filter row (Role chips, Tech + Team as popovers); remove duplicate "Role" label.
- Use `FilterToolbar`, `Chip/FacetRow`, `StatCard`; run `control-audit`, `surface-audit`, `table-header-audit`.

## Phase 4: Create-user flow
*Serves goal:* creation is quick and errors are obvious.
- Two-step or two-section dialog: Account (username, email, name, generated password with copy) then optional Assignment (teams/tech/TL/roles) collapsed by default; dialog scroll 853px to under 560.
- Backend returns field-keyed errors (`{username: [...]}`) from `create_user`; frontend maps via `useFormErrorHandler` into `createErrors` (never populated today). Client checks: email format, password policy text from backend.
- Role pills: disable incompatible combos (HBPR excludes the rest) with the reason inline.
- Tests: duplicate username shows inline error; generated password satisfies `validate_password`.

## Phase 5: Verification
*Serves goal:* proves each fix at scale.
- `py -3.14 manage.py test apps.users`; `npx vitest run src/pages/admin src/components/admin`; eslint, `tsc --noEmit`, the three audits.
- Browser (e2e settings + 600 users): search `bulk000` finds it, page 2/3 work, CR badges present, create dup username shows inline error, light+dark+375px, zero console errors, request count and payload size recorded vs the baseline above.

## Not now (separate decisions)
- Collapse role storage (3 sources: profile flags, `role_codes` JSON cache with `icontains`, `UserRole`) to `UserRole` only: migration + 20+ readers; do after Phase 1-4.
- `stats` / team-leader lists are readable by any authenticated user (employee got org-wide counts and TL names with member counts): confirm intent with owner before changing.
- `_sync_roles` issues ~12 queries per write (per-role exists + assign/revoke); fine for single edits, revisit for bulk.
