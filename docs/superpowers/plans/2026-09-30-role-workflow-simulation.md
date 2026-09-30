# Role-workflow simulation — post-upgrade functional verification (Plan)

Goal: after the 2026-09 major-dependency series (Django 6, reportlab 5,
Tailwind 4, TypeScript 7, vitest 5 / framer-motion 13, react-table 9) and the
security/perf audit fixes, prove that **every role can still do its real work
and still cannot do anyone else's**, against the real stack (Django 6 + Vite +
a real browser), not just unit tests.

## Environment (each item was a real trap found while planning)

- **Interpreter:** `python` here is 3.11 + Django **5**; the upgraded stack needs
  `py -3.14` (Django 6.1.1). Playwright's `webServer` and `global-setup` call
  plain `python`, so runs must put a `python.cmd -> py -3.14` shim first on
  `PATH` (verified to resolve under `cmd.exe`, which is how Node spawns it).
- **Database:** `db.sqlite3` is hard-coded and Playwright's `global-setup` migrates
  and seeds whatever DB it hits. Runs use `DJANGO_SETTINGS_MODULE=config.settings_e2e`
  (separate `db.e2e.sqlite3`, gitignored; throttling off because every spec logs in
  and the 20/min auth throttle would 429).
- **Run:** from `frontend/`:
  `PATH=<shim dir>:$PATH DJANGO_SETTINGS_MODULE=config.settings_e2e npx playwright test --project=chromium`
  (then `--project=mobile-chromium`).

## Fixture (`seed_e2e_data`, idempotent, contract-tested)

| User | Roles | Purpose |
|---|---|---|
| `e2e_employee_a`, `e2e_employee_b` | employee | Plain employees on **Team A**, TL = `e2e_tl` |
| `e2e_tl` | employee, italian_tl | Team A leader |
| `e2e_hr` | employee, hr | Pure HR (write-blocked surfaces, `/hr/*`) |
| `e2e_admin` | employee, admin (staff) | Admin panel via role |
| `e2e_tl_hr` | employee, italian_tl, hr | Multi-role (must keep higher-role behavior) |
| `e2e_super` | superuser + staff | Backup/restore, superuser-only |
| `e2e_cr` | employee, cr_admin | Control-room-only user (CR-scoped UI) |
| `e2e_tl_b` | employee, albanian_tl | Leader of independent **Team B** |
| `e2e_employee_c` | employee | Team B member — cross-team isolation subject |

Password for all: see `E2E_PASSWORD` in the seed command.

## Layers

- **L1 — access matrix (fast, deterministic).** For every role x route: expected
  outcome is one of `allow` (page renders, no error boundary, no redirect),
  `deny` (redirected away), from the route guards in
  `components/routing/AppRoutes.tsx` (`CRUserGuard`, `TLRoute`, `HRRoute`,
  `SuperuserRoute`) and plugin metadata (45+ plugin routes across 13 plugins:
  `app`/`admin`/`hr` layouts). Expectations are written from the documented
  invariants (CLAUDE.md), then **compared with observed behavior**; every
  mismatch is triaged as a bug or a wrong expectation, never silently adjusted.
- **L2 — workflows (real user journeys).** Below.
- **L3 — data-scoping (security).** Team A TL must not see Team B people/logs;
  scoped payroll viewer must not see other teams' lines or company totals; HR
  write-block surfaces; CR-only user sees no employee pages.
- **L4 — upgrade risk probes.** One targeted check per upgraded dependency
  (below) so a regression maps back to the phase that caused it.

## L2 workflows by role

**Employee (`e2e_employee_a`)**
1. Login -> dashboard renders (react-table not involved; framer-motion cards).
2. Submit leave request (business-day validation: weekend-only range rejected,
   valid range accepted, balance decremented on approval, not on submit).
3. Log overtime / standby for the current month; see it in own tables
   (DataTable: sort, search, paginate); edit/delete while month is open; locked
   in past months (monthly-lock invariant).
4. Calendar: own leave visible; team calendar `is_public=False`.
5. Notifications: exactly **one** notification on leave creation (the
   double-dispatch fix), preferences toggle honored.
6. Settings page; logout clears session and offline queue.
7. Denied: `/team`, `/hr/*`, `/admin/*`, `/team/approvals`.

**Team leader (`e2e_tl`, Team A) and Team B leader (`e2e_tl_b`)**
1. `/team` shows only own team; `/team/approvals` lists only own team's pending.
2. Approve one leave / OT / standby; reject one with a reason; bulk approve
   (select-all checkbox, `BulkActionBar` count badge) — DataTable selection.
3. Approved leave deducts business days exactly once.
4. Scorecard / engagement pages (TL-only plugins) render; export action works.
5. Isolation: TL A cannot fetch TL B's employee (API 404/403 and absent in UI).
6. Denied: `/admin/*`, `/hr/*`.

**HR (`e2e_hr`)**, **TL+HR (`e2e_tl_hr`)**
1. `/hr/reports`, `/hr/team-leaders`, `/hr/calendars` render and export.
2. Holidays full CRUD scoped to accessible calendar workspaces; a holiday import
   / create is visible immediately (cache-invalidation fix).
3. `/hr/payroll/*`: view runs, download payslip; **pure HR write-block** surfaces
   stay blocked (`is_hr_only`); TL+HR keeps TL behavior on `/team/approvals`.
4. Denied: `/admin/*` (SuperuserRoute excludes `isHR`).

**Admin (`e2e_admin`) / Superuser (`e2e_super`)**
1. `/admin` dashboard; users (create, edit, TL assignment, tech levels), teams,
   clients, techs, resource access, global settings, leave balances,
   overtime/standby/leave logs (bulk actions, DataTable), plugin management
   (enable/disable + sidebar self-heal on refocus).
2. Reports: generate + export (PDF via reportlab 5, Excel) — download succeeds and
   the PDF starts with `%PDF`.
3. Payroll: wages -> draft run -> finalize -> payslip PDF; monthly-lock and
   `PayrollRunEntry` delete guard (400) respected.
4. Data import: sample template download, dry-run, commit (users, holidays).
5. Superuser only: backup/restore page reachable for `e2e_super`, **not** for
   `e2e_admin`.

**Control room (`e2e_cr`)**
1. Lands on control-room dashboard; no My Clients, no notification preferences,
   no Organigrama injection; employee pages redirect.

**Cross-cutting (any role)**
- Organigrama page: chart renders, sibling order stable (dagre stays on 1.1.8).
- Offline queue: enqueue while offline, flush when online (existing spec).
- Mobile viewport (`mobile-chromium`): sidebar/drawer, DataTable horizontal scroll.
- Dark/light toggle: no unstyled surfaces (Tailwind 4).

## L4 — one probe per upgrade

| Upgrade | Probe |
|---|---|
| Django 6 | Whole suite runs on the 3.14 server; admin login + `/admin/` reachable |
| reportlab 5 | Payslip PDF and report PDF download, `%PDF` header, non-empty |
| Tailwind 4 | `visual-guards.spec.ts` + screenshots of dashboard, a DataTable page, a dialog in light and dark; no unstyled content |
| TypeScript 7 / vitest 5 | Covered by build + unit suite (not runtime-visible) |
| framer-motion 13 | Animated cards/bulk bar appear, reduced-motion respected |
| react-table 9 | Every DataTable page: sort, search, paginate, select-all, hide column |
| dagre (unchanged) | Organigrama layout renders |

## Pass criteria / reporting

- Existing Playwright suite: green on desktop and mobile projects.
- New `role-workflows` specs: L1 matrix and L3 isolation assertions all green, or
  each failure triaged (app bug fixed with a test, or expectation corrected with
  a written reason).
- Findings, fixes, and anything not automatable are appended to
  `docs/superpowers/UPGRADE-JOURNAL.md`. Anything that needs a human eye
  (visual polish, PDF layout) is listed explicitly, not claimed as verified.

## Out of scope

- Production infrastructure (nginx/TLS/Redis/Postgres), load testing, live-DB
  query profiling (still open in the audit plan).
- Audit Phase 6 (permission-check centralization) — its own plan.


## Status (2026-09-30)

Executed. Results, the A/B attribution against the pre-upgrade commit, the fixture and
environment fixes, and what is still unverified are in the last section of
`docs/superpowers/UPGRADE-JOURNAL.md`. Implemented layers: L1 (access matrix, core and
all plugin routes), L2 workflows for employee / TL (two teams) / HR / admin /
superuser / control room (leave, overtime, payroll, backup), L3 isolation, L4
probes (reportlab PDFs, Tailwind themes, react-table DataTable). Not automated:
overtime/standby/leave through the real form UI, PDF layout review, push delivery.
