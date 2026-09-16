# Engineering Tracker — Design System & Surface Inventory

Persistent design memory. Read before any UI work. Source of truth order:
1. This file.
2. Theme tokens (`frontend/src/components/ui/tone.ts`, `frontend/src/theme/tokens.*`, `tailwind.config`).
3. Approved mockups in `Time Tracker UI Project/extra/` (Settings, HR Reports,
   Add Skills dialog, Admin Users — structural targets, already ported).

Full design pattern reference lives in `.devin/context/03-FRONTEND-PATTERNS.md`
(§10 a11y, §11 layout contracts, §13 dialog contract, §14 checkbox/bulk, §15
tone scale coverage) — this file does not repeat that content, only indexes it.

## Named direction: "Obsidian Enterprise"

Deep-slate layered surfaces, muted slate dividers, single purple accent
(`accent-violet` → `primary`), monospace numerics, no gradients except the
primary CTA (`Button variant="gradient"`), no glassmorphism except `GlassCard`
and modal backdrops. Any surface that reaches for raw palette classes
(`slate-`/`zinc-`/`gray-`/hex) or a second gradient is off-direction.

## Tokens (live, verified 2026-09-11)

- **Palette**: zero raw hex in any `.tsx` file (verified via repo-wide grep,
  0 hits). All color goes through Tailwind theme classes or `tone.ts`.
- **Elevation**: canvas → sidebar/panel → `card`/`card-raised` → `surface-sunken`
  (wells) — 3-level ramp per §11, both light and dark defined.
- **Typography**: Plus Jakarta Sans (UI), JetBrains Mono (numerics/codes).
  Scale: `text-micro` (10px) / `text-micro-lg` (11px) / 12 / 14 / 16 / 20 / 24.
  Arbitrary `text-[10px]`/`text-[11px]` is gated by `modal-audit.mjs` inside
  dialogs; outside dialogs it still exists in a few places (see findings).
- **Radius**: `--radius-control` (12px, buttons/inputs), `--radius-surface`
  (16px, cards), `--radius-dialog` (24px, modals).
- **Tone scale** (`components/ui/tone.ts`): `success|warning|danger|info|accent|neutral`,
  `toneSurfaceClass`/`toneTextClass`. Used for full tinted surfaces (badges,
  pills, callouts). **Not** the same rule as small inline text — see next.
- **Small-text status color exception** (§11, easy to misdiagnose as a `dark:`
  violation): standalone small text/count labels (not a full tone-surface
  pill) correctly use explicit `text-amber-700 dark:text-amber-400` -style
  palette pairs, because bare `text-success`/`text-warning`/`text-info` fails
  contrast on light backgrounds. A `dark:` variant is only a bug on a full
  tone-surface component (background+border+text bundled) — those must use
  `toneSurfaceClass` instead, which already encodes both modes.
- **Dialogs**: `DialogContent size="sm|md|lg|xl|full"` (448/512/672/896/full),
  one `DialogBody` scroll region, `DialogFooter` divider. Gate:
  `node scripts/modal-audit.mjs` (structural) + `modal-visual-audit.mjs`
  (hex/slate/gradient/`bg-card`). Both pass app-wide except one pre-existing,
  unrelated hit (`UserBulkCommandDrawer.tsx:173`, arbitrary `text-[10px]`).

## Surface inventory

Role column: **A**dmin-only route, **TL** (team leader + admin), **All**
(every authenticated role), **Emp** (employee-facing, no admin variant).
State column: coverage confirmed this session (✓ = verified this audit,
`—` = not individually re-verified, inherits whatever the page already had).

### Core app (`AppRoutes.tsx`)

| Route | Role | Primary component | Shared primitives used | Notes |
|---|---|---|---|---|
| `/login` | — | `LoginPage` | `GlassCard`, reduced-motion gate | — |
| `/dashboard` | All | `DashboardPage` → role-routed to `EmployeeDashboardPage`/`HRDashboardPage`/`TeamLeaderDashboard`/`DashboardEmptyState` | `PersonalDashboardView` (2-col grid), `EmptyState`, `GlassCard` | **Verified this session** — clean role router, every branch has a dedicated component including the "no role matched" empty state. Numeric hero values fixed for `font-mono` (see Batch A below). |
| `/overtime` | All | `OvertimePage` | `PageShell`, `LoadingCard`, `ErrorCard`, shared `hours_logs/` infra (`HoursLogDataTable`, `HoursLogBulkActionBar`, `HoursLogConfirmDialogs`, `HoursLogExportButtons`), `ConfirmDialog` (no native `confirm()`) | **Verified this session** — proper loading/error states, zero token violations |
| `/standby` | All | `StandbyPage` | same shared `hours_logs/` infra as Overtime | Structurally identical pattern to Overtime — not re-read line-by-line, inherits the same verification |
| `/leave-management` | All | `LeavePage` | `DataTable`, `FormDialog`, `ConfirmDialog` | **Verified this session** — clean, no native dialogs, proper loading state |
| `/admin/leave-requests` `LeaveRequestsTable` | A | — | `ConfirmDialog`, `Input` | **CRITICAL fixed this session** — reject action called native `prompt()` directly, banned by §11; now routes through a local `ConfirmDialog`+`Input` component mirroring the file's own `DeleteLeaveRequestButton` pattern |
| `/calendar` | All | `CalendarPage` | calendar-specific hue system (§15 exempt) | — |
| `/team/approvals` | TL | `TLApprovalDashboard` | `TLApprovalStats`, `ConfirmDialog`, `MonthPicker`, tabbed `DataTable` | **Verified this session** — has a real permission-denied `GlassCard` state, no native `confirm()`, sensible stats→filters→tabs→table hierarchy |
| `/team` | TL | `TeamOverviewPage` | `StatCard` grid, `TeamOverviewCard` | **Verified this session** — 4 hero numbers fixed for `font-mono` |
| `/hr/reports` | TL | `HRReportsPage` | `HRInsightsCard`, `HRReportActionBar`, `HRReportResults` | **Verified this session** — export bar merged into insight-card row |
| `/settings` | All | `SettingsPage` | 2-col grid, `NotificationPreferencesSection`, `MyClientsSection`, `ClientAssignmentSection` | **Verified this session** — already matches mockup |
| `/admin` | A | `AdminDashboardPage` | `StatCard` | — |
| `/admin/users` | A | `UsersPage` → `UsersPageContent` | `DataTable`, `TechFacetFilter` (new), `UserFilterTabs`, `UserBulkCommandDrawer` | **Built this session** — tech-facet filtering, server-side pagination fix |
| `/admin/teams` | A | `TeamsPage` | `DataTable` | — |
| `/admin/clients` | A | `ClientsPage` | `LoadingCard`, `ErrorCard`, `ClientDataTable` | **Verified this session** — clean |
| `/admin/techs` | A | `TechsPage` | `LoadingCard` (fixed), `EmptyState`, hand-rolled row list (not `DataTable`) | **Fixed this session** — loading state was a hand-rolled `Loader2` spinner, inconsistent with every sibling admin page's `LoadingCard`; swapped. Architecture note: page owns all React Query logic inline instead of an extracted hook (§2 pattern), and rows are a manual flex-list, not `DataTable` like `ClientsPage`/`TeamsPage` — both are Batch B/C-scale restructures, not touched. |
| `/admin/calendars` | A | `CalendarManagementPage` | — | — |
| `/admin/leave-balances` | A | `LeaveBalancesPage` | `DataTable` | — |
| `/admin/leave-requests` | A | `LeaveRequestsPage` → `LeaveRequestsTable` | `DataTable`, `StatusBadge` | **Fixed this session** — was importing a duplicate non-conformant `StatusBadge`, now uses the canonical `components/ui/StatusBadge` (tone tokens + `role="status"`) |
| `/admin/overtime-logs` | A | `OvertimeLogsPage` | `DataTable` | — |
| `/admin/standby-logs` | A | `StandbyLogsPage` | `DataTable` | — |
| `/admin/global-settings` | A | `GlobalSettingsPage` | single narrow card, 3 fields | **Verified this session** — narrow card is correct here (short content, not the "narrow+tall" anti-pattern); no change needed |
| `/admin/resource-access`, `/admin/resource-access/groups/:id` | A | Resource access pages | `DataTable`, dialogs | — |
| `/admin/reports` | A | `ReportsPage` (distinct from `/hr/reports`) | — | — |
| `/admin/plugins` | A | `PluginManagementPage` | — | — |

### Plugin routes

| Route | Plugin | Role | Notes |
|---|---|---|---|
| `/skills`, `/skills/team`, `/skills/history` | skills | Emp/TL | `AddSkillDialog` **verified this session** — now `divide-x` 50/50 two-pane at `xl` size |
| `/admin/skills/catalog`, `/admin/skills/settings` | skills | A | — |
| `/control-room/dashboard`, `/control-room/access`, `/admin/control-room/access` | control_room | varies | — |
| `/organigrama`, `/admin/organigrama*` | organigrama | varies | Org-chart role/type color coding — §15 exempt from tone migration |
| `/admin/payroll/*` (wages, runs, runs/:id, calendar, settings) | payroll | A | `PayrollSettingsPage` **refactored this session** — was cyclomatic 49/critical, split into `PayrollConfigurationForm` + `PayrollRuleSetsSection` + `PayrollRuleSetCard`; no longer flagged by `fallow health`. Code-reviewed, 0 findings, all 74 payroll tests green. |
| `/ticket-kpi/*` | ticket_kpi | varies | — |
| `/admin/data-import` | data_import | A | — |
| `/admin/audit-logs` | audit_log | A | — |
| `/admin/backup-restore` | site_backup | A | Restore-preview UnicodeDecodeError **fixed this session** |
| `/notifications` | notifications | All | — |
| `/analytics`, `/admin/analytics` | analytics | varies | — |

**55 routes total** (28 core + 27 plugin). This session did a structural,
evidence-based conformance sweep (token/hex/dark:/dialog-contract greps +
`fallow health`/dead-code) across all of them, and a full critique +
implementation + screenshot-verify pass on 5 (`/admin/users`, `/settings`,
`/hr/reports`, `/skills` Add-Skill dialog, `/admin/leave-requests`). The
remaining ~50 surfaces were NOT individually opened and critiqued this
session — see `.devin/tracking/design-audit-2026-09-11.md` for what was and
wasn't covered, and why a full per-surface pass was deferred.

## Known intentional token exceptions (do not "fix")

Do not migrate these to `toneSurfaceClass` — they encode identity/category,
not status, and collapsing them loses real information (§15 in
03-FRONTEND-PATTERNS.md has the full reasoning per file):

- `components/calendar/calendarStyles.ts` and its consumers (`EventCard`,
  `ConflictCard`, `CarryOverCard`, `CalendarBottomCards`, etc.) — 5 distinct
  event/status hues.
- `components/calendar/UserAvatar.tsx` — 6-color user-ID rotation.
- `plugins/skills/utils/proficiencyLevels.ts` / `categoryAccents.ts` and their
  consumers (`SkillsDenseMatrix`, `SkillsHeatmapGrid`, `SkillsMatrixTable`,
  `SkillsMemberColumn`, `SkillsCatalogWorkspace`, `SkillsTeamToolbar`) — L1-L5
  tier scale + category color wheel.
- `plugins/organigrama/components/{CustomChartViewer,BuilderNode,OrgNode}.tsx`
  — org-chart role/type color coding.

## App-wide numeric convention (2026-09-11)

Hero/KPI numbers (bold, `text-lg` or larger, the primary metric a card
exists to show) MUST pair `font-mono` with `tabular-nums` — `tabular-nums`
alone only aligns digit widths within whatever font is active, it does not
switch to JetBrains Mono. The canonical `components/ui/StatCard.tsx` and
`components/calendar/StatCard.tsx` already did this correctly; a repo-wide
grep for `tabular-nums` found ~15 other hero-number spots that had
`tabular-nums` without `font-mono` (`TeamOverviewCard`,
`PersonalDashboardProgressCard`, `PersonalDashboardPendingCard`,
`MonthlyComparisonCard`, `CalendarGroupStatsCard`, `AggregateCard`,
`VacationReport`) — fixed this session. Dense inline table/list numerics
(ticket_kpi tables, `RestorePreviewTable`, `BackupRestorePage`,
`useUserColumns` hire_date column, control_room roster views,
`CalendarSidebarUserList`) were deliberately left alone: changing table-cell
typography app-wide is a Batch B call (visual regression risk across many
surfaces, needs screenshot validation), not a mechanical Batch A swap.

## Last Updated

2026-09-11 (final) — initial creation + Admin Users tech-facet build, HR
Reports/Settings/Add-Skills-modal mockup verification, site_backup bug fix,
Batch A fixes (StatusBadge consolidation, app-wide hero-number `font-mono`
conformance, app-wide `PageShell` duplication fix across 4 pages), Batch C
(`PayrollSettingsPage` complexity refactor), and 4 widened surface passes
covering 23 deeply-critiqued surfaces plus a structural sweep of the rest.
Companion engineering audit: `.devin/tracking/engineering-audit-2026-09-11.md`
(dependencies, security, N+1/perf, write-loops, infra, indexes — all clean
or already-fixed). Session closed out; see both tracking files' "Closing
status"/"Recommendation" sections for what's left for a future pass.
