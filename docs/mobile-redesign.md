# Mobile and tablet refactor: what we did, and what is left

Started 2026-11-08. Rules for future code live in `docs/workflow-invariants.md` item 61; this file is the record: why, what shipped (with PRs), how it works, how to verify it, and what is still open.

## 1. Goal and constraints

- Make the employee and leader pages usable at 393px (phone) and 820px (tablet), and borrow ideas from the AI Studio mockup (`engineering-time-tracker-(mobile)/`, untracked, with its own `DESIGN.md`).
- The mockup is a **wireframe, not a spec**: it has no real roles, and it shows money, leave categories (Annual/Medical/Casual), "Approve All" and a role toggle that do not exist in the data model. Anything that would show teammates' statuses to employees is forbidden by the team confidentiality rule.
- "Do not break the app visually on mobile, just make it better": every change is opt-in per page or CSS-only below a breakpoint, desktop is unchanged, and permissions, locks and approvals stay in the one place they were already decided.

## 2. The problem we found (audit)

Before the work, phones got the desktop UI squeezed in: tables 600 to 1,400px wide inside a 325px card (status, hours and actions off-screen), a hamburger as the only navigation, a top install banner that covered the header and blocked the hamburger, KPI cards five across with labels on their icons at 820px, forms as small centred modals, a Calendar that opened on a cut-off list, tab strips with a silently clipped last tab, and a Dashboard where the useful things were far down. "Before" screenshots are `real-*` in the untracked `engineering-time-tracker-(mobile)/shots/`; "after" are `after-*`.

## 3. What shipped (all merged to `main`)

| PR | Change |
|---|---|
| #254 | `DataTable` `mobileCard`: phone cards for Overtime, Standby, Leave and TL Approvals; one Export menu on phones |
| #255 | Team Overview cards |
| #256 | Install banner moved to a bottom card (it covered the header) |
| #257 | KPI cards: no label/icon overlap at 820px, two columns on phones; System Status username truncates |
| #258 | Ticket KPI team uploads/members and Engagement by team cards |
| #259 | Ticket KPI member table shows `N/A` instead of `nullh` / `null%` |
| #260 | Dashboard one-tap shortcuts (Overtime, Standby, Leave) |
| #261 | Phone bottom tab bar (More opens the drawer); offline/update/install notices sit above it |
| #262, #264, #271 | This log, invariant 61, CLAUDE.md router row, PR tables |
| #263 | Bottom-sheet Overtime, Standby and Leave forms (`DialogContent side="bottom"`, `FormDialog mobileSheet`) |
| #265 | Calendar list on phones: per-day agenda (`ListViewAgenda`) |
| #266 | Dashboard KPI cards as a 2x2 grid |
| #267 | `ScrollFadeX`: edge fade on the Scorecard and HBPR tab strips |
| #268 | Dashboard: pending items above upcoming time off |
| #269 | Dashboard: activity feed shows five items with Show all / Show less |
| #270 | Weekly Generator opens as a bottom sheet |
| #272 | E2E login helper snoozes the two-factor prompt (it blocked 21 calendar specs) |
| #274 | Phone header: search button (opens the command palette) and account menu |
| #275 | Tab bar: tabs can shrink so "More" is not cut off at 320px |
| #276 | Customizable tab bar: pin 3 or 4 pages from the account menu (per user, stored on the device) |
| #277 | Tapping an Overtime, Standby or Leave card opens the full record as a bottom sheet |
| #278 | Admin Users as phone cards with a collapsible Filters toggle |
| #279 | Phone greeting card and pending strip on the employee dashboard; Pending Approvals counts as one row of three; breach banner wraps on phones |
| #280 | TL Dashboard stat cards 2x2 on phones |
| #281 | Scorecard team roster as phone cards |
| #282 | Ticket KPI stat cards two across |
| #283 | Ticket KPI records as phone cards; Skills KPI cards two across |
| #284 | Admin Teams, Audit Logs and Notification types as phone cards |
| #285 | Organigrama toolbar and canvas height, Analytics filters wrap, Global Settings tabs as one scroll strip |
| #286 | HR pages (leave requests, payroll runs, wages, team leaders, reports) as phone cards |
| #287 | Admin HBPR Assignments, Standby Logs (and Overtime Logs), Leave Balances, Control Room access as phone cards |
| #288 | QA sweep: tab labels Home / Pending, TL card footers, chip row fade, record sheet rows, hero strip contrast |

## 4. How it works (the pieces)

- **Cards** (`components/ui/DataTableCards.tsx`, `DataTable` prop `mobileCard`): below 768px (`MOBILE_CARD_QUERY`) a row renders as a card with `title`, `hero`, `status`, `meta[]` and `actions` chosen by column id. The card reuses the table's own cell renderers and actions column, so permissions, month locks, paid-hours blocks, half-day amounts and approve/reject conditions cannot drift. Checkboxes and select-all stay (bulk actions work), actions stay visible at 44px, the whole card calls `onRowClick`. A page with no `mobileCard` is unchanged. Opted in: Overtime, Standby, Leave, TL Approvals, Team Overview, Ticket KPI team, Engagement by team, Admin Users/Teams/Audit Logs/Notifications/HBPR Assignments/Standby and Overtime Logs/Leave Balances/Control Room access, HR leave/payroll/wages/team leaders/reports, Scorecard team. Hand-rolled tables get a local card list (Ticket KPI records).
- **Tab bar** (`components/layout/MobileBottomNav.tsx`): pins the first four visible of Dashboard, Pending Approvals, Overtime, Standby, Leave, HR Leave Requests, HR Payroll, taken from the sidebar's `visibleItems` so role, plugin and pure-HR/HBPR/CR gating has one source. Fewer than three pinned pages hides it. It publishes `--bottom-nav-h` so every fixed bottom element can sit above it (`bottom-[var(--bottom-nav-h,0px)] md:bottom-0`).
- **Bottom sheets**: `DialogContent side="bottom"` is a sheet below `md` and the normal modal from `md`; `FormDialog mobileSheet` opts a form in (Overtime, Standby, Leave, Weekly Generator).
- **Dashboard** (`pages/dashboard/`): `DashboardQuickActions` (gated by the same visible-nav source), 2x2 `PersonalDashboardStats`, pending above time off (`max-lg:order-first`), `ActivityTimeline` collapse (`max-md:hidden` past five).
- **Calendar**: `ListView` renders `ListViewAgenda` on phones (a heading per day, a card per event); tablet and desktop keep the table. Workspace privacy (`useValidWorkspaceIds`) is untouched.
- **Scroll hint**: `ScrollFadeX` is a scrollbar-less horizontal scroller that fades an edge only while content is hidden past it.

## 5. Did we match the mockup? (honest scorecard)

| Mockup idea | Status |
|---|---|
| Touch cards instead of wide tables | Done for the employee, leader, HR and admin tables (Users, Teams, Audit Logs, Notifications, HBPR Assignments, Standby/Overtime Logs, Leave Balances, Control Room access, HR leave/payroll/wages/team leaders/reports, Scorecard team, Ticket KPI) |
| 4 pinned tabs plus a hub | Done (tab bar, More opens the drawer). Pinning is customisable per user from the account menu (#276) |
| Quick actions on the dashboard | Done |
| Bottom sheets for forms | Done for Overtime, Standby, Leave, Weekly Generator and the record detail (#277); admin forms are still centred modals |
| Two-tier surfaces, 44px targets, dark mode | Held (existing surface/control audits pass); employee pages checked dark at 320/393 |
| Modern header with search, profile, dark toggle, role switch | Done except the dark toggle and role switch (#274). Role switch is not copied (no such feature) |
| Quick launcher (search every menu, pin to bar) | Done: the header search opens `CommandPalette`; pinning via #276 |
| Record detail sheet when tapping a card | Done (#277) |
| Tab customizer | Done (#276) |

So: the layout problems (tables, navigation, notices, forms, Calendar, Dashboard order) are fixed and the phone UI is clearly better, but the mockup's **header (search + profile) and launcher** are the biggest gaps between "improved" and "modern like the mockup". They are the next priority.

## 6. Verification we ran

- Unit tests next to every new component (cards, tab bar, notices, sheets, agenda, `ScrollFadeX`, dashboard pieces); `tsc`, ESLint, Prettier on touched files, `table-header`, `control` and `surface` audits, `modal-audit`.
- Live checks at 393/820 (and 320 for sheets, dashboard, dark mode) with no horizontal overflow outside intended scrollers.
- `calendar.spec.ts` in `mobile-chromium` at 393px: 5 of 5 pass after #272 (before it, 21 of 27 failed at every viewport because the two-factor prompt covered the page).
- Not checked in a browser: #268 (order), #269 (feed toggle), #270 (Weekly Generator sheet); the slide-up animation of sheets; dark mode for leader, HR and admin pages and the tab bar.

## 7. Open work (priority order)

1. Bottom sheets for admin forms (user create/edit, team, holiday, client).
2. Not seen in a browser: Ticket KPI records cards with real data (the e2e DB has no tickets), Skills Matrix / Dense / Heatmap / List on a phone, the dashboard "Review" strip scroll, Approve/Reject inside HR leave cards, light mode and 320px on the admin and HR pages.
3. Contrast from shared tokens: avatar initials (about 2.7:1) and the warning badge (4.01:1); Scorecard avatar stack hides initials where circles overlap; the TL dashboard tab switcher wraps "Team Workspace" at 320px.
4. Mockup look (gradient hero on every page, rounder surfaces, pill badges) is a design decision, not a bug: ask before changing shared tokens.
5. E2E on `main` fails on `preferences.spec.ts:49` and `skills.spec.ts:154`; fix or quarantine them (see section 8).
6. Not copying from the mockup: Annual/Medical/Casual split, standby money, "Approve All", role toggle, anything showing teammates' statuses.

## 8. Known issues found along the way

- CI E2E fails on `main` on `e2e/preferences.spec.ts:49` and `e2e/skills.spec.ts:154` (Team Skills 320px heading times out in CI; locally there is no overflow), both before this refactor started. Older note: CI E2E failed after 45 minutes on the Admin dashboard specs and never reaches the `mobile-chromium` project, so it is not a merge signal; merge rule used: Frontend and Backend (and PostgreSQL 16) pass, and layout PRs are run locally in `mobile-chromium` first.
- `e2e/hr-isolation.spec.ts` fails on `main` in `mobile-chromium` (sidebar is off-canvas on phones); `role-workflows.spec.ts` "admin users table: search filters" fails on `main` there; the "employeeA routes" test is flaky.
- Force-push is denied in agent sessions; stacked branches are refreshed by merging `main`.
- CI runs `prettier --check` on changed files only: run Prettier on the files you touched, never a whole directory.

## 9. Verify a change (recipe)

1. `cd frontend`: `npx tsc --noEmit`, `npx eslint <files>`, `npx prettier --check <files>`, `npx vitest run <paths>`, `node scripts/table-header-audit.mjs`, `node scripts/control-audit.mjs --strict --exclude=src/plugins/engagement`, `node scripts/surface-audit.mjs --strict --exclude=src/plugins/engagement`, `node scripts/modal-audit.mjs`.
2. Local e2e DB and servers (never `db.sqlite3`): `DJANGO_SETTINGS_MODULE=config.settings_e2e py -3.14 manage.py prepare_e2e_db`, then `seed_e2e_data`, then `runserver 127.0.0.1:8000` and `npm run dev -- --host 127.0.0.1`. Accounts and password: see `frontend/e2e/helpers.ts`.
3. Browser at 393x852 and 820x1180, light and dark: `documentElement.scrollWidth` must not exceed the viewport, touch targets 44px, dismiss the two-factor prompt with "Remind me later".
4. `npx playwright test --project=mobile-chromium e2e/<spec>` for specs touching the page.
5. Status of PRs: `gh pr list --repo shapufin/ENG_TRACKER --search "mobile OR phone in:title"`.
