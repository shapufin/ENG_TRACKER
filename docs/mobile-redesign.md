# Mobile and tablet refactor: tracking log

Goal: make the employee, leader, HR and admin pages usable at 393px (phone) and 820px (tablet), borrowing ideas from the AI Studio mockup (`engineering-time-tracker-(mobile)/`, untracked wireframe, not a spec) without breaking permissions, confidentiality or the existing table, dialog and control contracts. Rules for future code: `docs/workflow-invariants.md` item 61.

Started 2026-11-08. Audit evidence (screenshots) lives in the untracked `engineering-time-tracker-(mobile)/shots/` (`real-*` = before, `after-*` = after); re-capture with the recipe at the end.

## Status by PR

| PR | Change | State |
|---|---|---|
| #254 | Phone cards for Overtime, Standby, Leave, TL Approvals; one Export menu on phones; `DataTable` `mobileCard` | merged |
| #256 | Install banner moved to the bottom (it covered the header and blocked the hamburger) | merged |
| #257 | KPI cards: no label/icon overlap at 820px, two columns on phones; Dashboard System Status truncation | merged |
| #259 | Ticket KPI member table: `N/A` instead of `nullh` / `null%` | merged |
| #255 | Team Overview cards | merged |
| #258 | Ticket KPI team uploads/members and Engagement by team cards | merged |
| #260 | Phone dashboard shortcuts (Overtime, Standby, Leave) | merged |
| #261 | Phone bottom tab bar (More opens the drawer); notices sit above it | merged |
| #263 | Bottom-sheet Overtime, Standby and Leave forms on phones (`DialogContent` `side="bottom"`, `FormDialog` `mobileSheet`) | merged |
| #262 | This log, invariant 61, CLAUDE.md router row | merged |

Status check: `gh pr list --repo shapufin/ENG_TRACKER --search "mobile OR phone in:title"`. Merge rule used: Frontend and Backend checks pass; CI E2E is not a signal (see Known issues), so layout PRs are also run locally against the `mobile-chromium` project.

## What changed for users
- Tables that were 600-1,400px wide inside a 325px card are cards on phones, with status, hours/days and approve/reject/edit/delete visible; wider screens keep the table.
- A tab bar on phones (Dashboard, Overtime, Standby, Leave; leaders get Pending Approvals with its count; More opens the full menu).
- Dashboard opens with one-tap shortcuts on phones.
- Install notice no longer covers the header; offline and update notices sit above the tab bar.

## Dark mode and 320px pass (2026-11-08, employee pages)
Overtime, Leave, Standby and Dashboard in dark at 320px and 393px: `dark` class applies, no horizontal overflow outside intended scrollers, cards readable. Findings: the status filter chip row ("Pending / Approved / Rejected") scrolls sideways by design and the last chip is partly hidden at 320px; KPI label and icon touch at 320px (no overlap). Not yet repeated for leader, HR and admin pages or the tab bar (PR #261) in dark.

## Not done (priority order)
1. Dark mode and 320px for the leader/HR/admin pages and the tab bar; the status chip row is a deliberate one-line scroller on phones (`FilterChipRow`), so the last chip is partly hidden at 320px with no edge fade: add a fade hint.
2. Bottom sheet for the remaining dialogs: Weekly Generator and the admin forms (the variant exists; `FormDialog` takes `mobileSheet`). Not yet verified: the slide-up animation (only the end state) and dark mode.
3. ~~Calendar phone view~~ done: below 768px the List view renders `ListViewAgenda` (one heading per day, one card per event) instead of the table; same data, search and user click. Month view is fine at 820px. Workspace privacy rules (`useValidWorkspaceIds`) unchanged.
4. Dashboard: 2x2 KPI grid done (`PersonalDashboardStats`, 2 columns from phone width, gap 12px). Footers wrap to two lines per cell and the username truncates at 320px; accepted. Still open: pending items above recent time off, collapse the activity feed.
5. Tab strip scroll hints done for TL Scorecard and HBPR workspace (`ScrollFadeX`: edge fades only while content is hidden). Global Settings does not scroll (it wraps in a grid), so it needs no hint; wrapping to three rows on phones is still open.
6. Organigrama toolbar clips its download button; canvas is 1,700px tall for two nodes. Analytics "Advanced filters" is clipped.
7. Admin tables (Users, Teams, Audit Logs, HBPR Assignments, Standby Logs, Leave Balances, Control Room access, Notifications): keep in-card scroll; pin the first column; Admin Users filter chips take ~8 lines (collapse into a Filters sheet).
8. Mockup ideas deliberately not copied: Annual/Medical/Casual leave split, standby money amounts, "Approve All", role toggle, weekly bar chart (no such data), anything showing teammates' statuses to employees (team confidentiality).

## Known issues found along the way
- CI E2E (`E2E (Playwright)`) fails on `main` after 45 minutes on the Admin dashboard specs and never reaches the `mobile-chromium` project.
- `e2e/hr-isolation.spec.ts` (pure HR sidebar, HR+TL keeps overtime) fails on `main` in `mobile-chromium` because the sidebar is off-canvas on phones.
- `e2e/role-workflows.spec.ts` "admin users table: search filters" fails on `main` in `mobile-chromium`; the "employeeA routes" test is flaky.
- A force-push is denied in agent sessions; stacked branches are refreshed with a merge of `main` instead of a rebase.

## Verify a change (recipe)
1. `cd frontend`: `npx tsc --noEmit`, `npx eslint <files>`, `npx prettier --check <changed files>`, `npx vitest run <paths>`, `node scripts/table-header-audit.mjs`, `node scripts/control-audit.mjs --strict --exclude=src/plugins/engagement`, `node scripts/surface-audit.mjs --strict --exclude=src/plugins/engagement`.
2. Local e2e DB and servers (never `db.sqlite3`): `DJANGO_SETTINGS_MODULE=config.settings_e2e py -3.14 manage.py prepare_e2e_db` then `seed_e2e_data`, then `runserver 127.0.0.1:8000` and `npm run dev -- --host 127.0.0.1`. Accounts `e2e_employee_a`, `e2e_tl`, `e2e_hr`, `e2e_admin`, password `e2e_pass_2026`.
3. Browser at 393x852 and 820x1180, light and dark: no `documentElement.scrollWidth` above the viewport, touch targets 44px, dismiss the two-factor prompt with "Remind me later".
4. `npx playwright test --project=mobile-chromium e2e/<spec>` for specs touching the page.

## Mockup reference
`engineering-time-tracker-(mobile)/DESIGN.md` (untracked): TouchCard rule, 4 pinned tabs plus hub, quick launcher, bottom sheets, two surface tiers. Kept ideas: cards, tab bar, quick actions. Not built yet: command launcher, tab customizer, bottom sheets.
