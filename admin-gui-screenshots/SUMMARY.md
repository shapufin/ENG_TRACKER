# Admin visual lift: per-page summary

Branch `feat/admin-visual-lift-v2` (worktree). Task list: `git log --oneline` in that worktree. After screenshots were not captured: the worktree has no running app and `scripts/visual-verify.mjs` / `scripts/admin-shots.mjs --tag=after` were not run. 'What changed' is mapped from commit groups, not from per-page diffs.

| # | Route | What changed | Before | After | Issues not fixed |
|---|---|---|---|---|---|
| 01 | `/admin` | Linked KPI strip with icon chips and real deltas; breadcrumbs; compact shell density | `before/light/01-dashboard.jpg`, `before/dark/01-dashboard.jpg` (tabs have `--tab-*` variants) | not captured | Browser Page Gates not run. AdminDashboardWidgets load flake seen in earlier runs. |
| 02 | `/admin/users` | Visual lift: FilterChipRow facets, RowActions with sticky actions column, dense rows, email column hidden by default (toggleable), breadcrumbs | `before/light/02-users.jpg`, `before/dark/02-users.jpg` (tabs have `--tab-*` variants) | not captured | Page Gates not run (no running app). |
| 03 | `/admin/teams` | Visual lift (people group): RowActions, dense rows, KPI/empty state, breadcrumbs | `before/light/03-teams.jpg`, `before/dark/03-teams.jpg` (tabs have `--tab-*` variants) | not captured | Page Gates not run (no running app). |
| 04 | `/admin/techs` | Visual lift (people group): RowActions, FilterChipRow, empty state, breadcrumbs | `before/light/04-techs.jpg`, `before/dark/04-techs.jpg` (tabs have `--tab-*` variants) | not captured | Page Gates not run (no running app). |
| 05 | `/admin/clients` | Visual lift (people group): RowActions, dense rows, empty state, breadcrumbs | `before/light/05-clients.jpg`, `before/dark/05-clients.jpg` (tabs have `--tab-*` variants) | not captured | Page Gates not run (no running app). |
| 06 | `/admin/hbpr-assignments` | Visual lift (people group): RowActions, KPI/empty state, breadcrumbs | `before/light/06-hbpr-assignments.jpg`, `before/dark/06-hbpr-assignments.jpg` (tabs have `--tab-*` variants) | not captured | Page Gates not run (no running app). |
| 07 | `/admin/skills/catalog` | Visual lift (skills): RowActions, dense rows, breadcrumbs | `before/light/07-skills-catalog.jpg`, `before/dark/07-skills-catalog.jpg` (tabs have `--tab-*` variants) | not captured | Page Gates not run (no running app). |
| 08 | `/admin/skills/settings` | Visual lift (skills): breadcrumbs, compact density | `before/light/08-skills-settings.jpg`, `before/dark/08-skills-settings.jpg` (tabs have `--tab-*` variants) | not captured | Page Gates not run (no running app). |
| 09 | `/admin/calendars` | Operations lift: RowActions, dense rows, breadcrumbs | `before/light/09-calendars.jpg`, `before/dark/09-calendars.jpg` (tabs have `--tab-*` variants) | not captured | Page Gates not run (no running app). |
| 10 | `/admin/overtime-logs` | Operations lift: RowActions, FilterChipRow, dense rows, breadcrumbs | `before/light/10-overtime-logs.jpg`, `before/dark/10-overtime-logs.jpg` (tabs have `--tab-*` variants) | not captured | Page Gates not run (no running app). |
| 11 | `/admin/standby-logs` | Operations lift: RowActions, FilterChipRow, dense rows, breadcrumbs | `before/light/11-standby-logs.jpg`, `before/dark/11-standby-logs.jpg` (tabs have `--tab-*` variants) | not captured | Page Gates not run (no running app). |
| 12 | `/admin/leave-requests` | Operations lift: RowActions, FilterChipRow, dense rows, breadcrumbs | `before/light/12-leave-requests.jpg`, `before/dark/12-leave-requests.jpg` (tabs have `--tab-*` variants) | not captured | Page Gates not run (no running app). |
| 13 | `/admin/leave-balances` | KPI strip, year/type chips, utilization column, RowActions | `before/light/13-leave-balances.jpg`, `before/dark/13-leave-balances.jpg` (tabs have `--tab-*` variants) | not captured | Page Gates not run (no running app). |
| 14 | `/admin/resource-access` | Governance lift: breadcrumbs, RowActions, compact empty state | `before/light/14-resource-access.jpg`, `before/dark/14-resource-access.jpg` (tabs have `--tab-*` variants) | not captured | Page Gates not run (no running app). |
| 15 | `/admin/reports` | Reports recomposed: KPI strip, ReportCatalog, archive panel, compact empty state, SectionHeading; team filter now applies to totals | `before/light/15-reports.jpg`, `before/dark/15-reports.jpg` (tabs have `--tab-*` variants) | not captured | F11: report history needs a backend writer (archive panel shows existing data only). Page Gates not run. |
| 16 | `/admin/plugins` | Governance lift: breadcrumbs, RowActions, density | `before/light/16-plugins.jpg`, `before/dark/16-plugins.jpg` (tabs have `--tab-*` variants) | not captured | Page Gates not run (no running app). |
| 17 | `/admin/ticket-kpi/mappings` | Governance lift: breadcrumbs, RowActions, density | `before/light/17-ticket-kpi-mappings.jpg`, `before/dark/17-ticket-kpi-mappings.jpg` (tabs have `--tab-*` variants) | not captured | Page Gates not run (no running app). |
| 18 | `/admin/data-import` | Real target icons, accessible target picker, KPI strip, stepper, SectionHeading | `before/light/18-data-import.jpg`, `before/dark/18-data-import.jpg` (tabs have `--tab-*` variants) | not captured | Page Gates not run (no running app). |
| 19 | `/admin/payroll/wages` | Payroll lift: RowActions, dense rows, breadcrumbs | `before/light/19-payroll-wages.jpg`, `before/dark/19-payroll-wages.jpg` (tabs have `--tab-*` variants) | not captured | Page Gates not run (no running app). |
| 20 | `/admin/payroll/runs` | Payroll lift: RowActions, dense rows, breadcrumbs | `before/light/20-payroll-runs.jpg`, `before/dark/20-payroll-runs.jpg` (tabs have `--tab-*` variants) | not captured | Page Gates not run (no running app). |
| 21 | `/admin/payroll/calendar` | Payroll lift: density, breadcrumbs | `before/light/21-payroll-calendar.jpg`, `before/dark/21-payroll-calendar.jpg` (tabs have `--tab-*` variants) | not captured | Page Gates not run (no running app). |
| 22 | `/admin/payroll/settings` | Payroll lift: density, breadcrumbs | `before/light/22-payroll-settings.jpg`, `before/dark/22-payroll-settings.jpg` (tabs have `--tab-*` variants) | not captured | Page Gates not run (no running app). |
| 23 | `/admin/analytics` | Icon KPI cards, period chips, single export, compact empty charts, SectionHeading | `before/light/23-analytics.jpg`, `before/dark/23-analytics.jpg` (tabs have `--tab-*` variants) | not captured | Page Gates not run (no running app). |
| 24 | `/admin/control-room/access` | System lift: breadcrumbs, RowActions, density | `before/light/24-control-room-access.jpg`, `before/dark/24-control-room-access.jpg` (tabs have `--tab-*` variants) | not captured | Leftover h-8 and emerald classes on CR rows not migrated. Page Gates not run. |
| 25 | `/admin/global-settings` | System lift: breadcrumbs, density | `before/light/25-global-settings.jpg`, `before/dark/25-global-settings.jpg` (tabs have `--tab-*` variants) | not captured | Page Gates not run (no running app). |
| 26 | `/admin/audit-logs` | System lift: breadcrumbs, dense rows | `before/light/26-audit-logs.jpg`, `before/dark/26-audit-logs.jpg` (tabs have `--tab-*` variants) | not captured | Page Gates not run (no running app). |
| 27 | `/admin/backup-restore` | System lift: breadcrumbs, density | `before/light/27-backup-restore.jpg`, `before/dark/27-backup-restore.jpg` (tabs have `--tab-*` variants) | not captured | Page Gates not run (no running app). |

Rows: 27.

## Known gaps
- F11: report history needs a backend writer; not implemented.
- Row-height measurement not run.
- Browser Page Gates not run for any page.
- `scripts/surface-audit.mjs` and its test do not exist on this branch (plan defect); surface audit not run.
- `TicketKPITeamPage.test.tsx` ("shows permission denied for non-team-leader") fails in the full vitest run; inferred pre-existing, not re-run at the base commit.
- AdminDashboardWidgets load flake: seen intermittently; did not reproduce in the second full run.
- Leftover `h-8` / emerald classes on Control Room access rows.
- Playwright admin specs, `admin-shots --tag=after` and the employee/tl spillover fingerprint check not run (no running app).
