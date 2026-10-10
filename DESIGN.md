# Engineering Tracker — Design System & Surface Inventory

Persistent design memory. Read before any UI work. Source of truth order:
1. This file.
2. Theme tokens (`frontend/src/components/ui/tone.ts`, `frontend/src/theme/tokens.*`, `tailwind.config`).
3. Admin lift plan + invariants: `docs/superpowers/plans/2026-10-10-admin-visual-lift.md`,
   CLAUDE.md Hot Invariant "Admin visual lift (2026-10-10)" (traps 1–5),
   `docs/ui-control-kit.md`, `docs/table-header-contract.md`.
4. Approved mockups in `Time Tracker UI Project/extra/` (Settings, HR Reports,
   Add Skills dialog, Admin Users — structural targets, already ported) and the
   `Downloads/AdminGUI` mockup (admin lift reference; its dark mode is broken
   and its data is fake — see the lift section below). `Design System.md` was
   merged into this file on 2026-10-10 — read this file, not that one.

Full design pattern reference lives in `.devin/context/03-FRONTEND-PATTERNS.md`
(§10 a11y, §11 layout contracts, §13 dialog contract, §14 checkbox/bulk, §15
tone scale coverage, §18 buttons/light tokens, §19 control kit) — this file
does not repeat that content, only indexes it. CLAUDE.md's router also points
at a §20 (lift anatomy) added with the lift; `.devin/` is untracked, so a
checkout whose copy predates the lift won't have it — those sessions must
rely on this file + CLAUDE.md.

## Named direction: "Obsidian Enterprise" (+ admin lift, 2026-10-10)

Deep-slate layered surfaces, muted slate dividers, single accent via the
`primary` token — **light `230 80% 55%` (indigo, identity restoration: the
`221 83% 53%` it replaced was already AA at 5.19:1, never "fix" contrast by
darkening it again), dark `262 83% 58%` (violet)** — monospace numerics, no
gradients except the primary CTA (`Button variant="gradient"`) and the
`.admin-canvas` page glow, no glassmorphism except `GlassCard` and modal
backdrops. Any surface that reaches for raw palette classes
(`slate-`/`zinc-`/`gray-`/`blue-`/`emerald-`/hex) or a second accent is
off-direction — including anything copied from the AdminGUI mockup, which is a
*translation source* (see lift section), never a literal class spec.

## Tokens (light values re-verified 2026-10-10 post-lift)

- **Palette**: zero raw hex in any `.tsx` file. All color goes through Tailwind
  theme classes or `tone.ts` (`toneSurfaceClass`/`toneTextClass` are Records —
  index them, don't call them). This rule now explicitly covers mockup-ported
  classes: `slate-*`, `blue-600`, `emerald-50`+`*-700` pairs all map to tokens
  (`bg-muted`, `primary`, `toneSurfaceClass.*`), never literal classes.
- **Elevation**: `.admin-canvas` page fill (`--canvas-glow-1/2` radial glows,
  on `<main>` in both shells) → sidebar/panel → `card`/`card-raised` →
  `surface-sunken` (wells). Interactive cards lift via `.surface-lift`
  (`--shadow-lift`, transform/opacity only — never `transition-all`, never a
  box-shadow transition).
- **Typography**: Plus Jakarta Sans (UI — the mockup's Inter was rejected,
  plan D2), JetBrains Mono (numerics/codes). Scale: `text-micro` (10px) /
  `text-micro-lg` (11px) / `text-dense` (13px, `DataTable` body) / 12 / 14 /
  16 / 20 / 24. Arbitrary `text-[10px]`/`text-[11px]` is gated by
  `modal-audit.mjs` inside dialogs; outside dialogs it still exists in a few
  places (see findings).
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

## Admin visual lift (merged on `main` @ `8b9d377`, 2026-10-10)

All 27 admin routes were visually lifted to the `Downloads/AdminGUI` mockup's
density/polish. **If your checkout predates the merge, merge `main` first — do
not rebuild these primitives.** Full spec:
`docs/superpowers/plans/2026-10-10-admin-visual-lift.md` (findings F1–F12,
decisions D1–D5, Page Gate G1–G5); traps (1)–(5) are pinned in CLAUDE.md's
"Admin visual lift" Hot Invariant.

| Mockup pattern | Primitive | Notes |
|---|---|---|
| KPI card: icon chip + value + delta + link | `StatCard` `iconTone`/`delta`/`to`/`onClick` | `GlassCard interactive` + `.surface-lift` when clickable; deltas only from real payloads |
| Labelled filter chips w/ counts | `FilterChipRow` (`FacetRow`+`Chip`, `aria-pressed`) | |
| Breadcrumbs | `AdminBreadcrumbNav` via `resolveAdminCrumbs`; plugin routes register in `ADMIN_PLUGIN_CRUMBS` | rendered by `AdminShell` |
| Hover row actions + sticky actions column | `RowActions` + `Button size="control-icon-sm"` + `TABLE_STICKY_ACTIONS_*` | visible on coarse pointers/`:focus-within`/selected; sticky cells must `cn()`-compose with `TABLE_BODY_CELL_CLASS` (trap 1); `group/row` lives in `DataTable`'s base row class (trap 2) |
| Two-line identity cell | `UserCell` (`components/admin/`) | |
| Compact empty state w/ CTA + preview | `EmptyState` `size="sm"`/`tone`/`preview` | |
| Severity banner (stackable) | `SeverityBanner` (from `AdminInsightsStrip`) | |
| In-page section header | `SectionHeading` (eyebrow + title + meta) | |
| Bulk-select bar + bulk edit | `BulkActionBar` → `UserBulkCommandDrawer` | §14 treatment; extend, don't hand-roll |
| Ctrl/Cmd+K palette | `AdminCommandPalette` (AdminShell, `userSearch`); `CommandPalette` (AppShell, nav only) | already shipped |
| Mockup `slate/blue/emerald` classes | tokens: `bg-muted`, `primary`, `toneSurfaceClass.*`, `.admin-canvas` | never raw classes |

**Still open:** (1) **Page Gate debt** — the sweep merged with G1–G5 skipped;
run `node scripts/admin-shots.mjs --tag=after --only=<slug>` (light+dark) +
click-through before calling a page done, else commit `wip(visual):` naming
the missing gates, never `feat:`. (2) **Record detail side panel** — mockup's
"row opens in a side drawer" isn't built; one shared drawer on the
`UserBulkCommandDrawer`/`Dialog` contract, then per-entity content. (3)
`SUMMARY.md` leftovers — report history needs a backend writer
(`GeneratedReport` REST create exists, no producer — F11); stray `h-8`+emerald
classes on control-room access rows; `AdminDashboardWidgets` load flake.
(4) Out of scope, undecided: sticky `thead`, grid/card view toggle.

**Mockup data is fake — never port it.** "DMF Enterprise", "Mission Control",
`v2.6-admin`, "44 users", "14,820 records", "+2.08 d/mo", Alice Bianchi /
Ilir Hoxha / DOME_TEAM / NOC_SHIFT, "Article 2109" footnotes, "RSA-2048
Signed" badges, Rome/Tirana hubs. Deltas render only from real payloads;
otherwise omit.

## Surface inventory

Role column: **A**dmin-only route, **TL** (team leader + admin), **All**
(every authenticated role), **Emp** (employee-facing, no admin variant).
State column: coverage confirmed this session (✓ = verified this audit,
`—` = not individually re-verified, inherits whatever the page already had).

**Note (2026-10-10):** the per-page "Notes" below predate the admin visual
lift (§ above). Every `/admin/*` row now additionally uses the lift
primitives (`AdminBreadcrumbNav`, `FilterChipRow`, `RowActions`+sticky
actions, `SectionHeading`, `text-dense` table bodies, `.admin-canvas` shell)
— treat "Verified this session" marks as 2026-09-11 evidence, and the lift's
unverified Page Gate debt as the current verification baseline.

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

## Table header contract (2026-10-05) — OVERRIDES THE MOCKUPS

The table header treatment is **deliberately not the mockup's**. The mockups
(`Time Tracker UI Project/{Admin,Employee,TL}/assets/tokens.css`) specify:

```css
table.data-table thead th { padding:.75rem 1rem; color:#94A3B8; font-weight:600;
  border-bottom:1px solid #1E2738; background:#0C1019; white-space:nowrap; }
```

— i.e. 12px, weight 600, muted slate, an **opaque `#0C1019` band**, and no
`text-transform`/`letter-spacing` anywhere. That was **overridden by an explicit
user decision (2026-10-05)**: the shadcn treatment (normal-case, body size,
`text-foreground`, transparent header) reads better. **Do not "restore" the mockup
values** — this note is the only reason the override survives.

Single source of truth: `frontend/src/components/ui/tableStyles.ts`. No `<thead>`
may declare header typography or a header fill inline; that is how 4 tracking
values, 3 font sizes and 5 band variants accumulated across 21 files.

| Constant | Use |
|---|---|
| `TABLE_HEAD_ROW_CLASS` | header row: transparent, separated by its bottom border only |
| `TABLE_HEAD_CELL_CLASS` | header cell: `text-foreground px-4 py-3 text-left font-medium whitespace-nowrap` |
| `TABLE_HEAD_CELL_CHECKBOX_CLASS` | the selection cell: `w-10 px-4 py-3 text-left` |
| `TABLE_BODY_CELL_CLASS`, `TABLE_ROW_HOVER_CLASS` | body cell / row hover |

Two traps, both test-pinned:

- The selection checkbox cell must use `TABLE_HEAD_CELL_CHECKBOX_CLASS`, **never**
  `TABLE_HEAD_CELL_CLASS` — the latter's padding fights `w-10` and breaks
  `DataTable.test.tsx`'s `select-all checks every row on the current page`.
- Compose alignment with `cn(TABLE_HEAD_CELL_CLASS, "text-right")`. Appending it in
  a template string does **not** merge: both `text-left` and `text-right` survive and
  CSS source order decides, not the class attribute.

Gate: `cd frontend && node scripts/table-header-audit.mjs` exit 0.

**Outstanding queue and the engineering detail** (per-file verdicts, migration
recipe, check commands, traps): the tracked **`docs/table-header-contract.md`**.
At handoff (2026-10-05) the gate reports **PASS — 0 violations across 19 files**;
every table is converged.

This closes the "Batch B" item noted in the numeric-convention section below:
table-cell typography is now decided once, app-wide, instead of per surface.

## Last Updated

2026-10-10 — **Admin visual lift** merged on `main` (`8b9d377`): 27 admin
routes lifted; new primitives (`FilterChipRow`, `RowActions`+sticky actions,
`AdminBreadcrumbNav`, `SeverityBanner`, `SectionHeading`, `StatCard`
iconTone/delta, `EmptyState` size/tone/preview, `text-dense`, `.admin-canvas`,
`.surface-lift`); light `--primary` restored to indigo `230 80% 55%`. Page Gate
G1–G5 was skipped in the first run — verification debt tracked above.
**`Design System.md` merged into this file** (single source of truth); that
file is now a redirect stub.

2026-10-05 — **table header contract** added and an explicit **override of the
`Time Tracker UI Project/` mockups** recorded (shadcn treatment chosen over the
mockup's 12px/muted/opaque-band header). Single source of truth
`components/ui/tableStyles.ts`, enforced by `scripts/table-header-audit.mjs`.
Supersedes the "Batch B" deferral in the numeric-convention section.

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
