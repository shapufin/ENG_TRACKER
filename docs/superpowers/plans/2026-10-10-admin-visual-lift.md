# Admin Visual Lift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring all 27 admin routes up to the `Downloads/AdminGUI` mockup's visual quality, density and interaction polish (and give light mode back the depth it lost in #66), using only real data, real routes and real logic, with zero functional regressions.

**Architecture:** Fix it once in tokens and shared primitives (Phase 1), then sweep pages in the owner's order (Phase 2): Reports → Analytics → Dashboard → Data Import → Leave Balances → the rest. Every page task ends with the same Page Gate: before/after screenshots in light and dark at 1440×900, click-through of every tab/popup/action, 2xx network, zero console errors, then tests, typecheck and build. Presentation layer only: no API, model, migration or route-path change.

**Tech Stack:** React 19, Tailwind 4.3 (tokens in `frontend/src/index.css`, `pointer-fine:`/`pointer-coarse:` variants available), framer-motion (`lib/motion.ts`), lucide-react, recharts 3, TanStack Query, `@tanstack/react-table` v9 (`DataTable`), vitest + RTL, Playwright (already a dev dependency).

**Spec:** the 2026-10-10 chat request (8 concrete gaps + working method + constraints, quoted where it matters below). Read alongside: `CLAUDE.md` (Hot Invariants: button, control kit, table header contract, dialog contract, motion system, plugin removal safety), `docs/ui-control-kit.md`, `docs/table-header-contract.md`, `.devin/context/03-FRONTEND-PATTERNS.md` §10/§13/§15/§18/§19, `.devin/context/12-VISUAL-VERIFICATION.md`, and the prior plans `docs/superpowers/plans/2026-10-08-admin-ui-polish-and-grid.md` (decisions D1 soft edge, flat cards) and `2026-10-08-admin-gui-mockup-adoption.md` (widgets, insights, palette — already shipped; do not redo).

**Evidence captured for this plan (untracked, owner's folder):**
- `admin-gui-screenshots/INDEX.md`, `pages/*.md`, `screenshots/*.jpg`: current app, 27 routes, light, 1440×900.
- `admin-gui-screenshots/mockup/`: mockup at 1440×900: `01-dashboard.jpg`, `02-users.jpg` (row hover), `13-leave-balances.jpg`, `15-reports.jpg` (full page), `18-data-import.jpg`, `18-data-import-dark.jpg` (shows the mockup's dark mode is broken).

## Review note (2026-10-10, after the first implementation run)

Reviewed line by line against source once the sweep had already landed on `main`.
Every measured finding F1–F12 and every listed file target was confirmed against
the code (file:line anchors were accurate). Corrections from that review are
applied in this revision and are flagged inline where they bite:

- **The Page Gate is a gate, not a suggestion.** The first run implemented all 27
  pages with G1–G5 skipped ("no running app") and merged it anyway. A page task
  whose gate cannot run is `wip(visual):` with the missing gates named, never
  `feat:`/`fix:`. See Global Constraints.
- **D1 is an identity change, not a contrast fix** — see §1.
- **Sticky cells compose with the standard cell classes, they never replace
  them** — Task 7.
- **`group/row` goes in the base row class list** — Task 7.
- **`scopeLabel` must read "All teams in your workspaces" under a workspace
  scope** — Task 10 / D5.
- **Tabs come from `manifest.json`, cross-checked by the test** — Task 0.
- **F11 wording**: `GeneratedReport` does expose a REST `create` path; nothing
  calls it. Say that, not "no create exists".

---

## 0. Measured findings (why each task exists)

| # | Finding (measured live, `e2e_super`, 1440×900) | Root cause | Fixed in |
|---|---|---|---|
| F1 | Table rows are **69 px** (leave balances); cells alone give ~45 px | row action buttons are `h-11 w-11` (44 px) in `components/ui/tableColumnHelpers.tsx` (10 occurrences) and `pages/admin/hooks/useLeaveBalanceColumns.tsx`; 5 column sets use the helpers | Task 7 |
| F2 | "Everything is larger": sidebar item 40 px with 20 px icons, brand name wraps to 3 lines, page padding 32 px | `SidebarNavLink` `py-2.5` + `h-5 w-5`; `AdminSidebar` brand block not truncated; `AdminShell` `lg:p-8` | Task 9 |
| F3 | Light mode "blue and bland" | #66 (`7e1824d`, 2026-10-08) removed `shadow-glass` + `backdrop-blur-xl` + default hover lift from `GlassCard`; light `--primary` drifted from the original indigo `230 80% 55%` (commit `9884859`) to `221 83% 53%`; borders darkened in #47 | Tasks 1–2 |
| F4 | Reports shows one giant empty box | `ReportsPage.tsx:88-97` renders `GlassCard > EmptyState` (`p-12`) with no CTA | Tasks 4, 10 |
| F5 | KPI cards are text-only or have a bare icon, no delta, no hover | `StatCard` has no delta/tone/link API; `KpiStripWidget` has no icons; Analytics shows `0% vs prev` for every metric | Tasks 3, 11, 12 |
| F6 | No breadcrumbs; 9 admin pages use an uppercase `category` eyebrow instead, the rest nothing | `PageShell` only has `category` | Task 5 |
| F7 | Users row actions (edit, reset password, delete, grant CR) **exist but are off-screen** to the right of a 10-column scrolling table | actions column is the last, non-sticky column | Task 7 |
| F8 | Data Import: 11 of 14 target cards show an empty icon slot (title indented); cards are clickable `div`s, not keyboard reachable | `TargetPicker.tsx` ignores `target.icon` (API already sends a lucide name) and uses a 3-entry map; `GlassCard onClick` | Task 13 |
| F9 | Analytics: 5 KPI cards in a 4-col grid leave an orphan; "Hours Trends" empty state is a 230 px box with one sentence; two Export buttons do the same thing | fixed `grid-cols-4`; chart card `min-h` | Task 11 |
| F10 | The mockup's own dark mode is broken (white cards on near-black, invisible headings) | mockup | Decision D3 |
| F11 | `GeneratedReport` has a REST `create` path (`GeneratedReportViewSet`, `apps/reports/viewsets.py:145`) but **no producer or UI caller** — only tests write rows | backend | Decision D4 (use analytics export-jobs instead) |
| F12 | Reports summary/detail queries ignore the selected team (`useReportManagement` never passes `team_ids`, though `SummaryReportParams.team_ids` exists); only the per-user table is filtered client-side | pre-existing bug | Decision D5 |

## 1. Decisions (owner confirms before Phase 1; defaults are the recommendation)

| ID | Question | Recommendation (default if not answered) |
|---|---|---|
| D1 | Light `--primary` back to indigo? | **Yes: `230 80% 55%`** (the original). Computed white-on-fill 6.16:1 and fill-as-text-on-white 6.16:1, both AA. **This is an identity/hue restoration, not a contrast fix**: the value it replaces (`221 83% 53%`) already measured 5.19:1 white-on-fill, i.e. AA. Do not reopen D1 as an accessibility change, and do not "fix" a contrast complaint by darkening `--primary` again. Shift `--primary-hover`, `--primary-text`, `--ring`, `--focus`, `--border-focus` by the same hue. Dark `--primary` (violet) unchanged. |
| D2 | Keep Plus Jakarta Sans (identity) or switch to the mockup's Inter? | **Keep Plus Jakarta.** Density comes from sizes (F1/F2), not the font. Only table body text drops to 13 px via a new `text-dense` token. |
| D3 | Align dark tokens with the mockup's? | **No.** The mockup dark mode is broken (F10). Keep the Obsidian dark tokens; only add dark values for new tokens and verify every new component in dark. |
| D4 | Reports "history / schedules / signed" structure | **Use real sources only:** analytics plugin `export-jobs` and `scheduled-reports` (when the plugin is active and the viewer has the grant). No "signed", no fake counts. Core `GeneratedReport` history is out of scope (needs a backend writer). |
| D5 | Fix F12 (team filter ignored by report totals)? | **Yes, as its own small commit in Task 10**: pass `team_ids` to summary + detailed and add it to both query keys. It uses an existing API param, so it is not an API contract change; it is a behaviour fix, so it gets its own test and its own line in the summary. Say "no" to skip it and instead label the KPI scope "All teams in your workspaces" (never a bare "All teams" while `useValidWorkspaceIds` can scope the query). |

## Global Constraints

- **Presentation only.** No change to API contracts, serializers, models, migrations, URL route paths, permissions or query parameters sent to the backend (D5 is the single, explicitly approved exception). If a task seems to need one, stop and report it.
- **The Page Gate is a gate, not a suggestion.** A page task is only done when G1–G5 actually ran. If the e2e servers/DB are unavailable, commit `wip(visual): <page> (gate not run: G1, G3, G4)` and say so in the summary — never a `feat:`/`fix:` commit that implies verification that did not happen. The first run of this plan merged 27 pages of visual change with every gate skipped; that is the failure mode this rule exists to prevent.
- **Real data only.** Never port mockup data, names, hubs ("Italy/Tirana", "DMF Enterprise"), "RSA-2048 Signed", invented deltas or invented counts. A delta/trend line appears only where the payload has the numbers; otherwise omit it.
- **Tokens, not colours.** No raw hex, no `slate-/gray-/zinc-` classes, no `bg-white`, no `dark:` colour overrides (surface-audit). Status colour only via `tone.ts` / `tone-*` tokens. Chart colour via `hsl(var(--chart-N))`.
- **Fix in the primitive, never per call site** (CLAUDE.md "Button look is decided in `button.tsx`", control kit rule).
- **Motion:** animate only `transform` and `opacity`; never `transition-all`; every `motion.*` uses `useMotionTransition()` or `useReducedMotion()`; CSS effects get a `motion-reduce:` / `@media (prefers-reduced-motion: reduce)` off-switch.
- **Text ≥ 12 px** (`text-xs`); KPI and table numbers `tabular-nums`; loading copy ends with `…`; headings `text-balance`.
- **Accessibility must not regress:** every icon-only button has `aria-label` (and a tooltip); visible `focus-visible` rings; hover-revealed controls are also revealed on `:focus-within`, on selected rows, and are always visible on `pointer: coarse`; buttons are `<button>`, navigation is `<Link>`; no clickable `div`.
- **Table header contract:** header typography/fill only from `components/ui/tableStyles.ts`; never edit `TABLE_HEAD_CELL_CLASS` values; new constants are added there and `table-header-audit` stays green.
- **Dialog contract:** `size` prop only; `node scripts/modal-audit.mjs` exit 0.
- **Plugin removal safety:** core never statically imports `frontend/src/plugins/<name>/**`; plugin data is reached over REST, gated on `usePlugins().activePlugins` + `usePluginPermissions()`.
- **React Query keys** include every result-changing parameter. Reuse existing keys (`["export-jobs"]`, `["scheduled-reports"]`, `["admin","balances"]`, …) so caches are shared, not duplicated.
- **No new dependencies.** Do not touch `package.json` / lockfile.
- **Windows shell:** write commands one per line (no `&&`). Run Django commands with `py -3.14`. Quiet flags. Targeted tests while iterating; the full pass once at the end (Task 20).
- **Git:** branch `feat/admin-visual-lift` from fresh `main`. Commit after each task. Never push or open a PR unless the owner asks.

## Review Focus

1. **Hover-only affordances on touch/keyboard:** a TL/admin on a tablet or using Tab must still reach every row action. Pinned by the `RowActions` tests (`pointer-coarse` classes, `focus-within`, selected row) in Task 7 and the keyboard step in every Page Gate.
2. **Empty and zero data:** zero balances, zero export jobs, analytics plugin disabled, summary with only `leave` keys (Vacations tab), a target with an unknown icon name. Each must render a compact empty state or fallback, never `NaN`, `undefined h` or a blank card. Pinned in Tasks 3, 10, 13, 14.
3. **Sticky actions column over horizontal scroll:** the sticky cell must keep the row hover/selected fill (no transparent hole) and must not cover the focused cell. Pinned in Task 7 (`DataTable` test) and Task 15's Users Page Gate.
4. **Light/dark parity of new effects:** canvas glow, card sheen and lift shadow must be visible but quiet in light, and must not create grey haze in dark. Pinned by the Page Gate dark captures plus the `tokens.test.ts` additions in Task 1.
5. **Plugin-gated Reports panel:** with the analytics plugin disabled, or the viewer lacking `export`/`manage`, the panel must not render and must not fire requests (no 403 in the console). Pinned in Task 10.

---

## 2. File structure (decided here; tasks reference these names)

| File | Status | Responsibility |
|---|---|---|
| `frontend/scripts/admin-routes.mjs` | create | The 27 admin routes from `INDEX.md` (`{ n, slug, path, tabs?: string[] }`) |
| `frontend/scripts/admin-routes.test.mjs` | create | `node --test` for the route list |
| `frontend/scripts/admin-shots.mjs` | create | Capture light+dark screenshots + console/network report per route (Page Gate tool) |
| `frontend/src/index.css` | modify | D1 primary hue, `--shadow-card` sheen, `--shadow-lift`, `--canvas-glow-1/2`, `.surface-lift`, `.admin-canvas` |
| `frontend/tailwind.config.js` | modify | `fontSize.dense`, `boxShadow.lift` |
| `frontend/src/theme/tokens.test.ts` | modify | pin new values, recompute AA for D1 |
| `frontend/src/components/ui/GlassCard.tsx` | modify | `interactive` → `.surface-lift` (transform/opacity only) |
| `frontend/src/components/ui/StatCard.tsx` | modify | `iconTone`, `delta`, `to`/`onClick` (interactive) |
| `frontend/src/components/ui/EmptyState.tsx` | modify | compact default, `tone`, `preview`, `size` |
| `frontend/src/components/ui/SectionHeading.tsx` | create | eyebrow + title + meta row for in-page sections |
| `frontend/src/components/layout/adminBreadcrumbs.ts` | create | pure `resolveAdminCrumbs()` |
| `frontend/src/components/layout/AdminBreadcrumbs.tsx` | create | breadcrumb `nav` rendered by `AdminShell` |
| `frontend/src/components/ui/FilterChipRow.tsx` | create | labelled chip row with counts (built on `FacetRow` + `Chip`) |
| `frontend/src/components/ui/RowActions.tsx` | create | per-row icon action group, hover-revealed |
| `frontend/src/components/ui/button.tsx` | modify | add `size: "control-icon-sm"` |
| `frontend/src/components/ui/tableStyles.ts` | modify | add sticky-actions constants (header + body) |
| `frontend/src/components/ui/DataTable.tsx` | modify | `group/row` on `<tr>`, sticky `actions` column, `text-dense` body |
| `frontend/src/components/ui/SeverityBanner.tsx` | create | severity-styled banner + stacked-deck pager (extracted from `AdminInsightsStrip`) |
| `frontend/src/lib/analyticsExports.ts` | create | `ExportJob` type + `formatBytes` moved out of `ReportsPanel.tsx` |
| `frontend/src/pages/admin/hooks/useReportArchive.ts` | create | gated reads of analytics export-jobs + scheduled-reports |
| `frontend/src/pages/admin/components/ReportCatalog.tsx` | create | the 3 real report cards (OT / Standby / Vacations) |
| `frontend/src/pages/admin/components/ReportKpiStrip.tsx` | create | period KPIs from `summaryData` |
| `frontend/src/pages/admin/components/ReportArchivePanel.tsx` | create | recent exports + active schedules (analytics-gated) |
| `frontend/src/pages/admin/components/ReportPeriodPresets.tsx` | create | This month / Last month / Quarter / YTD chips |
| `frontend/src/plugins/data_import/components/targetIcons.ts` | create | lucide name → component map (14 names + fallback) |
| `frontend/src/pages/admin/components/LeaveBalanceKpis.tsx` | create | KPI strip computed from loaded balances |
| page files | modify | listed per task |

---

## 3. The Page Gate (run at the end of every page task; referenced as "Page Gate")

Prerequisites (once per session): backend `py -3.14 manage.py runserver 127.0.0.1:8000 --noreload` with `DJANGO_SETTINGS_MODULE=config.settings_e2e` after `py -3.14 manage.py prepare_e2e_db`, and Vite `npm run dev -- --host 127.0.0.1` in `frontend/` (see memory `reference_e2e_runbook`, `.devin/context/12-VISUAL-VERIFICATION.md`). Login fixture: `e2e_super` (password in `frontend/e2e/role-workflows.spec.ts:52`). Never type real credentials.

- [ ] **G1 Capture after:** `node scripts/admin-shots.mjs --tag=after-<task> --only=<slug>[,<slug>]`. Expected: exit 0, `report.json` shows `consoleErrors: []` and `failedRequests: []` for every captured route in both themes.
- [ ] **G2 Visual diff:** open `before/<theme>/<NN-slug>.jpg` next to `after-<task>/<theme>/<NN-slug>.jpg` for light and dark; write two lines per page into the task's commit body: what changed, anything that looks worse.
- [ ] **G3 Click-through (CloakBrowser or Playwright MCP):** every tab, every view/details popup, every filter chip, every row action's dialog (open, then cancel — never confirm destructive actions), keyboard Tab through the toolbar and one table row (actions must appear on focus). Read `browser_console_messages(level:"error")` → empty; `browser_network_requests(filter:"/api/")` → all 2xx/3xx.
- [ ] **G4 Responsive spot-check:** 375 px and 768 px, light: no horizontal page scroll (`document.documentElement.scrollWidth <= innerWidth`), row actions visible without hover on 375 px (coarse pointer emulation via `resize_window preset:"mobile"`).
- [ ] **G5 Gates:** from `frontend/`, each on its own line:
  ```bash
  npx vitest run <the task's test files>
  npx eslint <the task's changed files>
  npx tsc --noEmit
  node scripts/control-audit.mjs --strict --exclude=src/plugins/engagement
  node scripts/surface-audit.mjs --strict --exclude=src/plugins/engagement
  node scripts/table-header-audit.mjs
  node scripts/modal-audit.mjs
  npm run build
  ```
  Expected: all exit 0. Do not start the next page until G1–G5 pass.

---

## Phase 0: Baseline harness

### Task 0: Route list + capture script + "before" baseline

**Files:**
- Create: `frontend/scripts/admin-routes.mjs`, `frontend/scripts/admin-routes.test.mjs`, `frontend/scripts/admin-shots.mjs`

**Interfaces:**
- Produces: `export const ADMIN_ROUTES: { n: string; slug: string; path: string; tabs?: string[] }[]` (27 entries, `n` = `"01"`…`"27"`, slug/path exactly as `admin-gui-screenshots/INDEX.md`). CLI `node scripts/admin-shots.mjs --tag=<name> [--only=slug,slug] [--themes=light,dark]` writes `admin-gui-screenshots/<tag>/<theme>/<n>-<slug>.jpg`, `.../<theme>/<n>-<slug>--tab-<k>.jpg` per tab, and `admin-gui-screenshots/<tag>/report.json` `{ [theme]: { [slug]: { consoleErrors: string[], failedRequests: string[] } } }`; exits 1 if any list is non-empty.
- Consumes: `createCollectors`, `dismissToasts` from `scripts/visual-capture-helpers.mjs`.

- [ ] **Step 1: Write `admin-routes.test.mjs`**: asserts `ADMIN_ROUTES.length === 27`, every `path` starts with `/admin`, slugs unique, `n` strictly increasing `"01"`…`"27"`, the entries for `reports` (`/admin/reports`, tabs `["OT & Standby","Vacations"]`), `data-import` (tabs `["Import","History"]`) and `dashboard` (`/admin`) match `INDEX.md`, and — when `admin-gui-screenshots/manifest.json` exists (untracked, so the test skips when it does not) — every `tabs` list equals the manifest's tab names for that route. That cross-check is what stops a hand-transcription drift.
- [ ] **Step 2: Run** `node --test scripts/admin-routes.test.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `admin-routes.mjs`** from `INDEX.md`, with `tabs` taken from `admin-gui-screenshots/manifest.json` (per-route tab names/popup counts) rather than re-read from `pages/<n>-<slug>.md`. The manifest is the same data the capture script will consume, so route list and capture stay in one contract.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Implement `admin-shots.mjs`.** Chromium via `@playwright/test`'s `chromium`, viewport 1440×900, `colorScheme` = theme, `localStorage.theme` set by `addInitScript` before navigation (same as `visual-verify.mjs` `createAuthContext`). Log in once through the real `/login` form with the fixture user (read password from env `ADMIN_SHOTS_PASSWORD`, default the fixture value from `e2e/role-workflows.spec.ts`), reuse `storageState` per theme. Per route: `begin()` collectors, `goto`, wait for `networkidle` + `main h1` (dashboard: the "Admin Dashboard" heading), `dismissToasts`, full-viewport JPEG quality 85; then click each `tabs` entry by `getByRole("tab", { name })` and capture. Never click non-tab controls.
- [ ] **Step 6: Capture the baseline**: `node scripts/admin-shots.mjs --tag=before`. Expected: 27 routes × 2 themes, `report.json` all empty lists (the 2026-10-10 light capture already had zero API errors; if dark shows any, record them in the commit body as pre-existing and continue).
- [ ] **Step 7: Commit**
  ```bash
  git add frontend/scripts/admin-routes.mjs frontend/scripts/admin-routes.test.mjs frontend/scripts/admin-shots.mjs
  git commit -m "chore(visual): admin route list and light/dark capture harness"
  ```
  (`admin-gui-screenshots/` stays untracked.)

---

## Phase 1: Foundation (shared primitives)

### Task 1: Light-mode depth tokens (D1) + canvas + lift utility

**Files:**
- Modify: `frontend/src/index.css` (`:root`, `.dark`, `@layer components`), `frontend/tailwind.config.js`
- Test: `frontend/src/theme/tokens.test.ts`

**Interfaces:**
- Produces CSS: tokens `--shadow-card`, `--shadow-lift`, `--canvas-glow-1`, `--canvas-glow-2` (both themes); classes `.surface-lift` and `.admin-canvas`; Tailwind `shadow-lift`, `text-dense` (`0.8125rem` / line-height `1.25rem`).

Values (light `:root`; dark values in brackets):
- D1: `--primary: 230 80% 55%`, `--primary-hover: 232 74% 49%`, `--primary-text: 230 80% 55%`, `--ring: 230 80% 55%`, `--focus: 230 80% 55%`, `--border-focus: 230 70% 66%` (dark: unchanged).
- `--shadow-card: inset 0 1px 0 hsl(0 0% 100% / 0.7), 0 1px 2px hsl(230 40% 20% / 0.06), 0 2px 6px -1px hsl(230 40% 20% / 0.06)` [dark: `inset 0 1px 0 hsl(220 40% 100% / 0.04), 0 1px 2px hsl(0 0% 0% / 0.4), 0 1px 3px hsl(0 0% 0% / 0.3)`].
- `--shadow-lift: 0 12px 28px -8px hsl(230 40% 20% / 0.16), 0 4px 10px -4px hsl(230 40% 20% / 0.08)` [dark: `0 12px 28px -8px hsl(0 0% 0% / 0.7), 0 0 0 1px hsl(262 83% 68% / 0.18)`].
- `--canvas-glow-1: 230 80% 55% / 0.07` [dark `262 83% 58% / 0.08`], `--canvas-glow-2: 262 83% 58% / 0.05` [dark `199 89% 48% / 0.05`].
- `.admin-canvas { background-image: radial-gradient(60rem 22rem at 15% -6rem, hsl(var(--canvas-glow-1)), transparent 70%), radial-gradient(40rem 18rem at 95% -4rem, hsl(var(--canvas-glow-2)), transparent 70%); background-repeat: no-repeat; }` (static, no motion).
- `.surface-lift`: `position: relative; transition: transform 200ms cubic-bezier(0.16,1,0.3,1);` and `::after { content:""; position:absolute; inset:0; border-radius:inherit; box-shadow: var(--shadow-lift), 0 0 0 1px hsl(var(--primary) / 0.28); opacity:0; transition: opacity 200ms; pointer-events:none; }`, `:hover, :focus-within { transform: translateY(-2px) }`, `:hover::after, :focus-within::after { opacity: 1 }`, and inside `@media (prefers-reduced-motion: reduce)` the transform is `none` (opacity change is kept: it is not motion).

- [ ] **Step 1: Update `tokens.test.ts` first**: replace the `--primary: 221 83% 53%` / `--primary-hover` / `--focus` / `--border-focus` pins with the D1 values; add `it("keeps the light lift tokens", …)` asserting the four new tokens exist in both blocks; extend the computed-contrast test with white on `--primary` ≥ 4.5 and `--primary-text` on `--card` ≥ 4.5 (expected ≈ 6.2).
- [ ] **Step 2: Run** `npx vitest run src/theme/tokens.test.ts`. Expected: FAIL on the new pins.
- [ ] **Step 3: Implement** the values above in `index.css` and the two Tailwind keys. Keep the `.dark {` block flat, with no comment containing `.dark` (the test anchors on it).
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Wire the canvas**: add `admin-canvas` to the `<main>` element in `components/layout/AdminShell.tsx` and to the main content wrapper in `components/layout/AppShell.tsx` (the owner asked for the user frontend too). Run `npx vitest run src/components/layout/AdminShell.test.tsx src/components/layout/AppShell.test.tsx` → PASS.
- [ ] **Step 6: Commit** `feat(theme): indigo light primary, card sheen, lift and canvas tokens`.

### Task 2: GlassCard lift uses `.surface-lift`

**Files:** Modify `frontend/src/components/ui/GlassCard.tsx`; Test `frontend/src/components/ui/GlassCard.test.tsx`

**Interfaces:** unchanged props. `interactive` → classes `surface-lift cursor-pointer` (drop `hover:-translate-y-1 hover:shadow-pop hover:border-border-focus transition-[…]`). Non-interactive cards stay static (the #66 rule: lift only when clickable).

- [ ] **Step 1: Test**: `it("interactive cards lift via surface-lift and never transition box-shadow")`: render `<GlassCard interactive>`, expect class `surface-lift`, expect className not to match `/transition-\[[^\]]*box-shadow/` nor `transition-all`; and `<GlassCard>` has no `surface-lift`.
- [ ] **Step 2: Run** `npx vitest run src/components/ui/GlassCard.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS. Also run `npx vitest run src/plugins/data_import src/components/admin/PluginManagementGrid.test.tsx` (interactive users) → PASS.
- [ ] **Step 5: Commit** `feat(ui): GlassCard interactive lift animates transform and opacity only`.

### Task 3: StatCard with icon chip, delta and link

**Files:** Modify `frontend/src/components/ui/StatCard.tsx`; Test `frontend/src/components/ui/StatCard.test.tsx`

**Interfaces (additive, all optional; existing props keep working):**
```ts
export interface StatDelta {
  /** Display text, already formatted from real data, e.g. "+4 new hires · 30d". */
  text: string;
  direction: "up" | "down" | "flat";
  /** Semantic colour; default "neutral". Only pass success/danger when the payload says which way is good. */
  tone?: "success" | "danger" | "warning" | "neutral";
}
// added to StatCardProps:
iconTone?: Tone;            // renders <IconWell tone={iconTone} size="md"> top-right instead of the bare icon
delta?: StatDelta;          // ArrowUpRight / ArrowDownRight / Minus (aria-hidden) + text, text-xs, tone text colour
to?: string;                // whole card is a <Link> (react-router); card becomes interactive (surface-lift)
onClick?: () => void;       // whole card is a <button type="button">; mutually exclusive with `to`
```
Rules: the accessible name of a linked/button card is `"{label}: {value}"` via `aria-label`; the inner value keeps `tabular-nums`; focus ring `focus-visible:ring-2 ring-focus` on the Link/button; `delta` and `trend` may both render (delta first).

- [ ] **Step 1: Tests** (add to `StatCard.test.tsx`):
  - `renders an icon well with the requested tone` → `container.querySelector('[aria-hidden="true"].rounded-xl')` has the `toneSurfaceClass.info` classes.
  - `renders a delta with direction icon and tone text` → `delta={{text:"+4 new hires · 30d",direction:"up",tone:"success"}}` shows the text and has class `text-tone-success-text`.
  - `flat delta uses the neutral tone` → `text-muted-foreground`.
  - `to makes the card a link with an accessible name` → `getByRole("link", { name: "Users: 11" })` with `href="/admin/users"` (wrap in `MemoryRouter`).
  - `onClick makes the card a button` → `getByRole("button", { name: "Users: 11" })`, click calls handler.
- [ ] **Step 2: Run** `npx vitest run src/components/ui/StatCard.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** `GlassCard` gets `interactive` when `to`/`onClick` is set; the Link/button wraps the card's content with `className="block h-full rounded-xl text-left"`.
- [ ] **Step 4: Run** → PASS; plus `npx vitest run src/pages/admin/components/UserStatsCards.test.tsx src/pages/admin/components/AuditLogStatsCards.test.tsx` → PASS (unchanged callers).
- [ ] **Step 5: Commit** `feat(ui): StatCard icon chip, delta line and linked cards`.

### Task 4: EmptyState compact by default, with preview

**Files:** Modify `frontend/src/components/ui/EmptyState.tsx`; Test `frontend/src/components/ui/EmptyState.test.tsx`

**Interfaces (additive):**
```ts
tone?: Tone;                    // IconWell tone, default "neutral"
size?: "sm" | "md";             // md (default): centred, p-8, gap-3, max-w-md text; sm: left-aligned row (icon | text | action), p-4 — for inline/table/chart slots
preview?: React.ReactNode;      // optional "what will appear" block under the action, wrapped in aria-hidden, opacity-70, pointer-events-none
secondaryAction?: React.ReactNode;
```
The icon renders inside `<IconWell tone size="md">` (replaces the muted circle); description `text-sm text-muted-foreground text-pretty`.

- [ ] **Step 1: Tests**: `md is compact (p-8, not p-12)`; `sm renders a left-aligned row`; `preview is hidden from assistive tech` (`closest('[aria-hidden="true"]')`); `renders primary and secondary actions in order`.
- [ ] **Step 2: Run** `npx vitest run src/components/ui/EmptyState.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; then `npx vitest run src/pages src/components` filtered to files importing `EmptyState` (`grep -rl "EmptyState" src --include=*.test.tsx`) → PASS (update only assertions that pinned `p-12`).
- [ ] **Step 5: Commit** `feat(ui): compact EmptyState with tone, size and preview`.

### Task 5: Admin breadcrumbs

**Files:**
- Create: `frontend/src/components/layout/adminBreadcrumbs.ts`, `adminBreadcrumbs.test.ts`, `AdminBreadcrumbs.tsx`
- Modify: `frontend/src/components/layout/AdminShell.tsx`; remove the `category` prop from the admin-only call sites: `pages/admin/AuditLogsEnhancedPage.tsx:71`, `CalendarManagementPage.tsx:97`, `components/HoursLogsPage.tsx:94`, `LeaveBalancesPage.tsx:98`, `LeaveRequestsPage.tsx:101`, `PluginManagementPage.tsx:34`, `ResourceAccessGroupPage.tsx:162`, `ResourceAccessPage.tsx:119,131,146`, `plugins/skills/pages/SkillsCatalogPage.tsx:171`. Leave `MySkillsPage`, `SkillsHistoryPage`, `SkillsTeamPage` (app shell) and `ControlRoomAccessPage` (also served in the app shell) untouched.

**Interfaces:**
```ts
export interface Crumb { label: string; to?: string }
/** Plugin admin routes that are injected via PluginSlot and so are not in AdminNavItem[]. Strings only: no plugin import. */
export const ADMIN_PLUGIN_CRUMBS: Record<string, { group: string; label: string }> = {
  "/admin/analytics": { group: "Extensions", label: "Analytics" },
  "/admin/control-room": { group: "Extensions", label: "Control Room" },
  "/admin/audit-logs": { group: "System", label: "Audit Logs" },
  "/admin/backup-restore": { group: "System", label: "Backup & Restore" },
};
export function resolveAdminCrumbs(pathname: string, items: AdminNavItem[]): Crumb[];
export const AdminBreadcrumbs: React.FC<{ items: AdminNavItem[] }>;
```
Algorithm: pick the nav item whose `path` is the longest match (`exact` items match only equal paths; others equal or `path + "/"` prefix); fall back to `ADMIN_PLUGIN_CRUMBS` by longest prefix. Result `[{label: group}, {label: page, to: path only if pathname is deeper}]`, plus `{label: "Details"}` when deeper. No match → `[]` (render nothing). Render: `<nav aria-label="Breadcrumb"><ol class="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">`, separator `/` `aria-hidden`, last crumb `aria-current="page" text-foreground font-medium`, links `hover:text-foreground focus-visible:ring-2 rounded-sm`. Placed in `AdminShell` directly above `<Outlet />` with `mb-2`.

- [ ] **Step 1: Tests** (`adminBreadcrumbs.test.ts`, using the real `allAdminNavItems` via `useAdminNavItems` output or a fixture copy):
  - `/admin` → `[{label:"Overview"},{label:"Dashboard"}]`
  - `/admin/users` → `[{label:"People"},{label:"Users"}]`
  - `/admin/payroll/runs/7` → `[{label:"Payroll"},{label:"Payrolls",to:"/admin/payroll/runs"},{label:"Details"}]`
  - `/admin/resource-access/3` → Governance / Resource Access (link) / Details
  - `/admin/ticket-kpi/mappings` → Tools / Ticket KPI
  - `/admin/audit-logs` → System / Audit Logs; `/admin/control-room/access` → Extensions / Control Room
  - `/admin/unknown` → `[]`
- [ ] **Step 2: Run** `npx vitest run src/components/layout/adminBreadcrumbs.test.ts` → FAIL.
- [ ] **Step 3: Implement** both files and mount in `AdminShell`; remove the listed `category` props.
- [ ] **Step 4: Run** the test + `npx vitest run src/components/layout src/pages/admin` → PASS (update tests that asserted the removed eyebrow text, if any).
- [ ] **Step 5: Commit** `feat(admin): route-derived breadcrumbs on every admin page`.

### Task 6: `FilterChipRow` and Users facet migration

**Files:**
- Create: `frontend/src/components/ui/FilterChipRow.tsx`, `FilterChipRow.test.tsx`
- Modify: `frontend/src/components/admin/UserFilterTabs.tsx`, `TechFacetFilter.tsx`, `TeamFacetFilter.tsx`, `pages/admin/components/CRUsersFilterButton.tsx` (consume it), keeping their existing props and tests.

**Interfaces:**
```ts
export interface FilterChipOption<V extends string = string> {
  value: V; label: string; count?: number; icon?: LucideIcon;
  /** Dashed outline for "missing data" buckets such as "No tech". */
  emphasis?: "default" | "missing";
}
export interface FilterChipRowProps<V extends string = string> {
  label: string;                       // FacetRow label (group name, aria-labelledby)
  options: FilterChipOption<V>[];
  selected: readonly V[];              // single-select callers pass [value]
  onToggle: (value: V) => void;
}
export function FilterChipRow<V extends string>(props: FilterChipRowProps<V>): JSX.Element;
```
Rendering: `FacetRow` + one `Chip` per option; icon `h-3.5 w-3.5 aria-hidden`; count in `<span className="tabular-nums rounded-full px-1.5 text-xs bg-foreground/[0.06]">` (pressed: `bg-primary-foreground/20`), never dimmed (Chip comment); `emphasis:"missing"` adds `border-dashed`. Phones: the chip container is one horizontally scrollable row (`flex-nowrap overflow-x-auto no-scrollbar snap-x` below `sm`, wraps from `sm`).

- [ ] **Step 1: Tests**: `renders a labelled group`, `marks selected chips aria-pressed`, `shows counts with tabular-nums`, `missing emphasis is dashed`, `onToggle receives the value`.
- [ ] **Step 2: Run** `npx vitest run src/components/ui/FilterChipRow.test.tsx` → FAIL.
- [ ] **Step 3: Implement**, then migrate the four Users filter components to render through it.
- [ ] **Step 4: Run** `npx vitest run src/components/ui/FilterChipRow.test.tsx src/components/admin/UserFilterTabs.test.tsx src/components/admin/TechFacetFilter.test.tsx src/components/admin/TeamFacetFilter.test.tsx src/pages/admin/components/UsersPageFilters.test.tsx` → PASS.
- [ ] **Step 5: Commit** `feat(ui): FilterChipRow with counts; Users facets use it`.

### Task 7: `RowActions`, sticky actions column, dense table body

**Files:**
- Create: `frontend/src/components/ui/RowActions.tsx`, `RowActions.test.tsx`
- Modify: `components/ui/button.tsx` (size), `components/ui/tableStyles.ts` (constants), `components/ui/DataTable.tsx`, `components/ui/tableColumnHelpers.tsx` (all helpers → `RowActions`), `pages/admin/hooks/useLeaveBalanceColumns.tsx`, `pages/admin/hooks/useUserColumns.tsx`, `components/admin/TeamsTableRow.tsx` (its `h-11 w-11`)
- Test: `components/ui/DataTable.test.tsx`, `components/ui/tableColumnHelpers.test.tsx`, `button.test.tsx`

**Interfaces:**
```ts
// button.tsx size map addition
"control-icon-sm": "h-[var(--control-h-sm)] w-[var(--control-h-sm)] rounded-[var(--control-radius)] p-0",
// RowActions.tsx
export interface RowAction {
  label: string;                 // full accessible name, e.g. "Edit user alice"
  icon: LucideIcon;
  onClick: () => void;
  tone?: "default" | "danger" | "warning" | "success";
  disabled?: boolean;
}
export const RowActions: React.FC<{ actions: RowAction[]; reveal?: "hover" | "always" }>; // default "hover"
// tableStyles.ts additions
export const TABLE_STICKY_ACTIONS_HEAD_CLASS = "sticky right-0 z-[1] bg-card shadow-[inset_1px_0_0_hsl(var(--line-subtle))]";
export const TABLE_STICKY_ACTIONS_CELL_CLASS = "sticky right-0 z-[1] bg-card shadow-[inset_1px_0_0_hsl(var(--line-subtle))] group-hover/row:bg-table-hover group-data-[state=selected]/row:bg-primary/10";
```
`RowActions` renders `div.flex.items-center.justify-end.gap-0.5`, each a ghost `Button size="control-icon-sm"` with `aria-label`, a Radix tooltip with the label, tone text (`text-destructive`, `text-tone-warning-text`, `text-tone-success-text`). `reveal="hover"` wrapper classes: `pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-fine:group-focus-within/row:opacity-100 pointer-fine:group-data-[state=selected]/row:opacity-100 transition-opacity duration-150 motion-reduce:transition-none` (coarse pointers: always visible; `--control-h-sm` already grows 2rem → 2.5rem under `@media (pointer: coarse)` in `index.css`, so the 40 px touch target needs no extra class). `DataTable`: `<tr>` gets `group/row`; the table gets `text-dense` instead of `text-sm`; a column whose `id === "actions"` gets the two sticky constants. The `actions` header text becomes `<span className="sr-only">Actions</span>` where it was `""`.

**Review traps (both cost a row of density when ignored):**
1. **Sticky cells compose — they never replace.** `DataTable.tsx:243` wraps every `<td>` in `TABLE_BODY_CELL_CLASS`; the header cells are wrapped in `TABLE_HEAD_CELL_CLASS`. So the actions column renders `cn(TABLE_BODY_CELL_CLASS, TABLE_STICKY_ACTIONS_CELL_CLASS)` in the body and `cn(TABLE_HEAD_CELL_CLASS, TABLE_STICKY_ACTIONS_HEAD_CLASS)` in the header. Using the sticky constants alone drops the standard padding/typography and quietly undoes Task 9.
2. **`group/row` belongs in the base row class list, not in the `getRowClassName` ternary.** `DataTable.tsx:214-219` computes the row class as `base + (isSelected && "bg-primary/10") + (onRowClick && "cursor-pointer") + (getRowClassName ? getRowClassName(row) : "hover:bg-table-hover")`. A page that passes `getRowClassName` **replaces** `hover:bg-table-hover`, so the sticky cell's `group-hover/row:bg-table-hover` shows an opaque hole against the row. Either mirror the hover fill in those page classes as a `group-hover/row:` variant, or make `getRowClassName` merge with the default instead of replacing it — decide once, in `DataTable`, and pin it with a test.

- [ ] **Step 1: Tests**
  - `RowActions.test.tsx`: `each action is a labelled button`; `hover reveal classes include pointer-fine, focus-within and selected variants`; `reveal="always" has no opacity-0`; `danger tone uses text-destructive`; `disabled action is disabled`.
   - `DataTable.test.tsx`: `rows carry group/row`; `actions column cells are sticky` **and still carry `TABLE_BODY_CELL_CLASS`** (compose, do not replace); `group/row is present when a page supplies getRowClassName`; existing `select-all checks every row on the current page` still passes.
  - `tableColumnHelpers.test.tsx`: no rendered button has class `h-11`; all have `h-[var(--control-h-sm)]`.
  - `button.test.tsx`: `control-icon-sm` produces equal height/width token classes.
- [ ] **Step 2: Run** `npx vitest run src/components/ui/RowActions.test.tsx src/components/ui/DataTable.test.tsx src/components/ui/tableColumnHelpers.test.tsx src/components/ui/button.test.tsx` → FAIL.
- [ ] **Step 3: Implement**, then convert the helpers, `useLeaveBalanceColumns` (View audit / Edit / Delete), `useUserColumns` (Edit / Reset password (warning) / Delete (danger) / Grant Control Room access, still only when `crActive && !crAccessUserIds.has(id)`), and `TeamsTableRow`. Keep every existing `aria-label` string, since e2e and unit tests select by them.
- [ ] **Step 4: Run** the Step 2 tests + `npx vitest run src/pages/admin src/pages/overtime src/pages/standby src/pages/team src/components/admin` → PASS; `node scripts/table-header-audit.mjs` → exit 0.
- [ ] **Step 5: Measure**: on `/admin/leave-balances` light, `document.querySelector("main tbody tr").getBoundingClientRect().height` ≤ 52 (was 69). Record the number in the commit body.
- [ ] **Step 6: Commit** `feat(ui): RowActions with hover reveal, sticky actions column, dense rows`.

### Task 8: `SeverityBanner` with stacking

**Files:** Create `frontend/src/components/ui/SeverityBanner.tsx`, `SeverityBanner.test.tsx`; Modify `pages/admin/components/AdminInsightsStrip.tsx` (render through it; keep its data/dismiss/pager logic and its tests)

**Interfaces:**
```ts
export type Severity = "critical" | "warning" | "info" | "positive";
export const SEVERITY_META: Record<Severity, { tone: Tone; label: string; Icon: LucideIcon }>; // moved from AdminInsightsStrip: danger/OctagonAlert, warning/AlertTriangle, info/Info, success/CheckCircle2
export interface SeverityBannerProps {
  severity: Severity;
  title: string;
  message?: string;
  action?: React.ReactNode;
  onDismiss?: () => void;
  pager?: { index: number; total: number; onPrev: () => void; onNext: () => void };
  /** Counts of the whole queue by severity, shown as "2 critical · 1 warning" when total > 1. */
  counts?: Partial<Record<Severity, number>>;
}
```
Stacking: when `pager.total > 1`, render up to two `aria-hidden` "deck" layers behind the banner (`absolute inset-x-2 -bottom-1.5` and `inset-x-4 -bottom-3`, `rounded-lg border bg-card`, opacity 0.7/0.4) so it reads as a stack; queue order stays critical → warning → info → positive (`lib/adminInsights.ts` RANK). Severity colours come only from `toneSurfaceClass[SEVERITY_META[s].tone]`: critical red, warning amber, info blue, positive green.

- [ ] **Step 1: Tests**: `uses the tone for each severity`; `shows "n of m" and severity counts when stacked`; `renders deck layers only when total > 1`; `dismiss button is labelled`.
- [ ] **Step 2: Run** `npx vitest run src/components/ui/SeverityBanner.test.tsx` → FAIL.
- [ ] **Step 3: Implement** + refactor `AdminInsightsStrip` to use it.
- [ ] **Step 4: Run** the test + `npx vitest run src/pages/admin/components/AdminInsightsStrip.test.tsx` → PASS.
- [ ] **Step 5: Commit** `feat(ui): SeverityBanner with severity tones and stacked queue`.

### Task 9: Density pass on the shell + `SectionHeading`

**Files:**
- Modify: `components/layout/SidebarNavLink.tsx`, `SidebarSectionLabel.tsx`, `AdminSidebar.tsx` (brand), `AdminShell.tsx` (padding), `PageShell.tsx` (title `text-balance`)
- Create: `components/ui/SectionHeading.tsx`, `SectionHeading.test.tsx`
- Test: `SidebarNavLink.test.tsx`, `SidebarNavLink.text-contrast.test.tsx`, `AdminSidebar.test.tsx`, `PageShell.test.tsx`

**Values:** nav link `py-2 pointer-coarse:py-2.5`, icon `h-4 w-4` (≈ 36 px item on desktop, ≥ 40 px on touch); section label `mt-4 pt-3 first:mt-0`, inner `pb-1 tracking-[0.14em]`; brand name `truncate text-base` on one line, "Enterprise" micro-label kept at `text-xs`; `AdminShell` content wrapper `px-4 py-4 md:px-6 md:py-5 lg:px-8 lg:py-6`.

```ts
export const SectionHeading: React.FC<{
  eyebrow?: string;            // e.g. "Step 1" or "Overview" — mono, text-xs, uppercase, tracking-wider, inside a tone-neutral pill
  title: string;               // h2, text-base font-semibold text-balance
  meta?: React.ReactNode;      // right-aligned, text-xs text-muted-foreground (wraps under on phones)
  id?: string;                 // for aria-labelledby on the section
}>;
```

- [ ] **Step 1: Tests**: `SectionHeading renders an h2 with eyebrow and meta`; `SidebarNavLink uses the compact padding with a coarse-pointer fallback` (classes `py-2` and `pointer-coarse:py-2.5`); `AdminSidebar brand name is single-line truncated`.
- [ ] **Step 2: Run** `npx vitest run src/components/ui/SectionHeading.test.tsx src/components/layout` → FAIL on the new tests.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS (keep the text-contrast test green; it guards the active label colour).
- [ ] **Step 5: Shell-only Page Gate**: `node scripts/admin-shots.mjs --tag=after-shell --only=dashboard,users,reports`; check sidebar and header in light + dark; G5 gates.
- [ ] **Step 6: Commit** `feat(ui): compact admin shell density and SectionHeading`.

---

## Phase 2: Pages (owner's order)

### Task 10: Reports (`/admin/reports`)

**Files:**
- Create: `lib/analyticsExports.ts`, `pages/admin/hooks/useReportArchive.ts` (+ test), `pages/admin/components/ReportPeriodPresets.tsx` (+ test), `ReportKpiStrip.tsx` (+ test), `ReportCatalog.tsx` (+ test), `ReportArchivePanel.tsx` (+ test)
- Modify: `pages/admin/ReportsPage.tsx`, `components/analytics/ReportsPanel.tsx` (import `ExportJob`, `formatBytes` from `lib/analyticsExports.ts`), `pages/admin/components/ReportFilterPanel.tsx` (host presets), and for D5 `hooks/useReportManagement.ts` + `pages/admin/hooks/useReportsPage.ts`

**Interfaces:**
```ts
// lib/analyticsExports.ts
export interface ExportJob { job_id: number; status: "pending"|"running"|"completed"|"failed"; format: "excel"|"csv"; file_size_bytes: number; error_message: string|null; created_at: string|null; completed_at: string|null }
export function formatBytes(bytes: number): string; // moved verbatim
// useReportArchive.ts — gated on usePlugins().activePlugins includes "analytics"
export function useReportArchive(): {
  enabled: boolean;                                  // plugin active AND (canExport || canManage)
  exports: { data: ExportJob[]; isLoading: boolean; isError: boolean; enabled: boolean }; // canExport("analytics"); key ["export-jobs"], GET "plugins/analytics/metrics/export-jobs/"
  schedules: { data: ScheduledReport[]; isLoading: boolean; isError: boolean; enabled: boolean }; // canManage("analytics"); key ["scheduled-reports"], GET "plugins/analytics/scheduled-reports/"
};
// ReportPeriodPresets.tsx
export type PeriodPreset = "this_month" | "last_month" | "this_quarter" | "ytd";
export function presetRange(preset: PeriodPreset, today: Date): { start: string; end: string }; // ISO yyyy-mm-dd, local calendar
export const ReportPeriodPresets: React.FC<{ start: string; end: string; onSelect(range: { start: string; end: string }): void }>; // FilterChipRow, pressed when start/end equal the preset
// ReportKpiStrip.tsx
export const ReportKpiStrip: React.FC<{ tab: "overtime_standby" | "vacation"; summary: SummaryReport; scopeLabel: string }>;
// ReportCatalog.tsx
export type ReportKind = "overtime" | "standby" | "leave";
export const ReportCatalog: React.FC<{
  tab: "overtime_standby" | "vacation"; summary: SummaryReport | null; start: string; end: string; scopeLabel: string;
  canExport: boolean; onExport(kind: ReportKind): void; onView(): void;
}>;
// ReportArchivePanel.tsx
export const ReportArchivePanel: React.FC; // uses useReportArchive(); returns null when !enabled
```

Page layout (top to bottom), all on real data:
1. Breadcrumb (Task 5) → `PageShell` title "Intelligence & Reports" unchanged; header action = the generate button using `variant="gradient"` (the one hero CTA on the page). Keep the visible label "Generate Intelligence" (grep `frontend/e2e` and unit tests before renaming anything).
2. Filter card: existing `ReportFilterPanel` fields plus `ReportPeriodPresets` above the date range (selecting a preset sets `start`/`end` only; it does not auto-generate).
3. Segmented tabs "OT & Standby" / "Vacations" (existing `Tabs`).
4. **Not generated yet:** `EmptyState size="md" tone="info" icon={FileBarChart}` with title "Pick a period, then generate", description "Totals, per-person breakdown and Excel exports appear here.", action = generate button (disabled while `isLoading`), `secondaryAction` = "Use this month" (applies `presetRange("this_month")`, then calls `handleGenerate`), `preview` = three skeleton KPI tiles + three skeleton report-card rows (static divs, `aria-hidden`). Card height ≤ 320 px at 1440×900.
5. **Generated:** `ReportKpiStrip`, 4 `StatCard`s with `iconTone`:
   - OT tab: Overtime `{overtime.total_hours}h` (delta flat: `"{approved_hours}h approved · {pending_count} pending"`), Standby `{standby.total_hours}h` (same pattern), Pending decisions `{overtime.pending_count + standby.pending_count}` (tone warning if > 0, link `/admin/overtime-logs`), Records `{overtime.total_entries + standby.total_entries}` ("entries in period").
   - Vacations tab: Vacation days `{leave.total_days}d`, Approved `{leave.approved_days}d`, Pending `{leave.pending_count}` (link `/admin/leave-requests`), Requests `{leave.total_requests}`.
   - A missing summary key renders "—" with hint "Not included in this report", never `NaN`.
   - Numbers via `Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })`.
6. `ReportCatalog`: the real exports of the active tab as rich cards (OT tab: Overtime ledger + Standby ledger; Vacations tab: Vacation ledger). Each card: `IconWell`, title, one-line description, badges `XLSX` and scope, metadata row `Period {start – end via Intl.DateTimeFormat}` · `Records {entries}` · `Total {hours|days}`, actions `View` (ghost, scrolls to the results heading via `onView`) and `Export XLSX` (outline, calls existing `downloadExcel(kind)`; disabled with tooltip "Generate first" until `summaryData` exists). This replaces `ReportExportActions` (delete the file only if no other importer remains). **Scope wording:** `scopeLabel` is the team name when one is selected, and `"All teams"` only when there is *no* filter at all. Reports are also workspace-scoped (`useValidWorkspaceIds`, `useReportsPage.ts:18-20`), so when a workspace scope is active with no team selected the label must read `"All teams in your workspaces"` — a bare "All teams" is a lie the totals do not support.
7. Existing result sections (`OvertimeStandbyReport` / `VacationReport` / per-user table) under a `SectionHeading eyebrow="Results"`.
8. `ReportArchivePanel` (right column at ≥ 1280 px, below at narrower widths): "Recent exports" = last 5 `ExportJob`s as rows (format badge, status tone + icon, `formatBytes`, created date), and "Active schedules: N" with the next `next_run_at`, plus a link "Manage in Analytics" → `/admin/analytics`. Empty lists use `EmptyState size="sm"`. Not rendered at all when `!enabled`.

D5 (separate commit): `useReportManagement` passes `team_ids` (`selectedTeam === "all" ? undefined : selectedTeam`) to summary and detailed and adds it to both query keys; `useReportsPage` passes it through. `scopeLabel` is then truthful **only if it also accounts for the workspace scope** — one team selected → the team name; no team but a workspace scope → `"All teams in your workspaces"`; nothing selected at all → `"All teams"`.

- [ ] **Step 1: Tests**
  - `useReportArchive.test.ts`: plugin inactive → no request (`api.get` not called) and `enabled:false`; active + export only → exports query runs, schedules does not; active + manage → both.
  - `ReportPeriodPresets.test.tsx`: `presetRange("last_month", new Date(2026,0,15))` → `{start:"2025-12-01", end:"2025-12-31"}`; `this_quarter` on 2026-05-10 → `2026-04-01`…`2026-06-30`; `ytd` → `2026-01-01`…today; chip pressed when range matches.
  - `ReportKpiStrip.test.tsx`: OT tab shows the four values from a fixture summary; a summary without `standby` shows "—" and no `NaN`; Vacations tab shows leave values.
  - `ReportCatalog.test.tsx`: OT tab renders two cards with period/records/total; export disabled with no summary; clicking Export calls `onExport("overtime")`.
  - `ReportArchivePanel.test.tsx`: returns null when disabled; renders job rows with formatted size; empty exports → compact empty state.
  - D5: `useReportManagement` test (new or existing): query key contains the team id; `team_ids` param sent.
- [ ] **Step 2: Run** `npx vitest run src/pages/admin/hooks/useReportArchive.test.ts src/pages/admin/components/Report` → FAIL.
- [ ] **Step 3: Implement** components, then recompose `ReportsPage.tsx` (stays orchestration only).
- [ ] **Step 4: Run** the tests + `npx vitest run src/components/analytics src/pages/admin/components/OvertimeStandbyReport.test.tsx` → PASS.
- [ ] **Step 5: Commit** `feat(reports): KPI strip, report catalog, archive panel and compact empty state`.
- [ ] **Step 6: D5** (if approved): test → fail → implement → pass; commit `fix(reports): apply the team filter to report totals`.
- [ ] **Step 7: Page Gate** (`--only=reports`), including: generate with "This month", switch tabs, export one XLSX (download starts, 200), open/close every popup, analytics panel visible (plugin active in e2e DB).

### Task 11: Analytics (`/admin/analytics`)

**Files:** Modify `pages/analytics/AnalyticsPage.tsx`, `components/analytics/AnalyticsMetrics.tsx`, `AnalyticsControls.tsx`, `AnalyticsTrendCharts.tsx`; Tests alongside (`AnalyticsMetrics.test.tsx`, `AnalyticsControls.test.tsx`, create if missing)

Changes:
- Metrics grid: `grid gap-4 grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]` (5 metrics fill one row at 1440, no orphan).
- Each metric → `StatCard` with `iconTone` from `getMetricConfig` (map `glow` → tone: primary→info, success→success, warning→warning) and `delta`: `change === 0` → `{text:"No change vs previous period", direction:"flat"}`; otherwise `{text: formatTrend(m), direction: m.trend === "up" ? "up" : "down", tone:"neutral"}` (direction is shown, goodness is not asserted).
- Period buttons Week/Month/Year/Custom → `FilterChipRow label="Period"` single-select (same `onPeriodChange` values).
- One Export: remove the header "Export Report" button; the controls-row format select + Export stays (both called the same `handleExport`). Update any test that clicked the header button.
- Sections: `SectionHeading eyebrow="Overview"` (hotspots, insights, metrics), `"Trends"` (charts), `"Exports & schedules"` (ReportsPanel, ScheduledReportsPanel).
- Chart empty states: `EmptyState size="sm" icon={LineChart}` "No overtime or standby logged in this period" + action "Show this year" (`onPeriodChange("year")`, passed down from the page); the chart card shrinks to content (no fixed `min-h` when empty).

- [ ] **Step 1: Tests**: metrics grid uses auto-fit; zero change renders "No change vs previous period"; period chips are `aria-pressed`; only one "Export" button on the page (render `AnalyticsPage` with mocked hooks); empty trends render the action and clicking it requests `"year"`.
- [ ] **Step 2: Run** `npx vitest run src/components/analytics src/pages/analytics` → FAIL on new tests.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(analytics): icon KPI cards, period chips, single export, compact empty charts`.
- [ ] **Step 6: Page Gate** (`--only=analytics`): open Advanced Filters, Settings modal (cancel), switch every period, Stacked/Trend toggle.

### Task 12: Admin Dashboard (`/admin`)

**Files:** Modify `pages/admin/components/dashboard-widgets/KpiStripWidget.tsx`, the coverage-gaps widget (locate with `grep -rl "Coverage Gaps" src/pages/admin`), `AdminInsightsStrip.tsx` (done in Task 8; visual check only); Tests alongside.

Changes:
- `KpiStripWidget`: each `Kpi` gets a small `IconWell size="sm"` (Users/Users2, Teams/Building2, Pending/Inbox (warning when > 0), Overtime/Clock, Leave used/CalendarDays, Carryover/CalendarClock) and becomes a `<Link>` with hover fill + focus ring: Users → `/admin/users`, Teams → `/admin/teams`, Pending → `/admin/leave-requests`, Overtime → `/admin/overtime-logs`, Leave used → `/admin/leave-balances`, Carryover → `/admin/leave-balances?expiring=1` (existing URL filter). Deltas only from `AdminOverview`: Users hint `"+{headcount.new_hires_30d} new · 30d"` (direction up when > 0, flat when 0). Content vertically centred in the grid cell (`h-full flex flex-col justify-center`), so no empty band below the values.
- Coverage gaps rows: each count is a `<Link>` only where the target page already supports the filter by URL (check `UsersPageFilters`/`useUsersPage` for URL params; if none exists, leave the row as text: do not add new URL params in this task). Non-zero counts use `text-tone-warning-text`, zero uses muted.
- Banner: `SeverityBanner` (Task 8). Verify stacking with the 4 real insights in the e2e DB.
- Do not change `defaultAdminLayout` or saved-layout semantics (Hot Invariant: admin dashboard aggregates).

- [ ] **Step 1: Tests** (`KpiStripWidget.test.tsx`, create if missing): six links with the hrefs above; Users hint shows `+3 new · 30d` from fixture; skeleton still renders while loading; error retry unchanged.
- [ ] **Step 2: Run** `npx vitest run src/pages/admin/components/dashboard-widgets src/pages/admin/AdminDashboardPage.test.tsx src/pages/admin/AdminDashboardSections.test.tsx` → FAIL on new tests.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS, plus `npx vitest run src/pages/admin/AdminDashboardPage.edit.test.tsx`.
- [ ] **Step 5: Commit** `feat(dashboard): linked KPI strip with icon chips and real deltas`.
- [ ] **Step 6: Page Gate** (`--only=dashboard`): all 7 section tabs, Edit layout on then Esc, the `…` menu (no Reset confirm), insights pager prev/next and dismiss (then clear that browser's dismissal: `localStorage` key from `useDismissedInsights`).

### Task 13: Data Import (`/admin/data-import`)

**Files:** Create `plugins/data_import/components/targetIcons.ts` (+ test); Modify `TargetPicker.tsx` (+ `TargetPicker.modernization.test.tsx`), `pages/DataImportPage.tsx`, `ImportWizardBody.tsx` (stepper), `ImportSummaryCards.tsx` if it holds the KPIs

**Interfaces:**
```ts
// targetIcons.ts — static imports only (no dynamic lucide lookup: bundle size)
export const TARGET_ICONS: Record<string, LucideIcon>; // keys exactly: Building2, FolderTree, Sparkles, CalendarDays, Cpu, MonitorCog, CalendarCheck, UsersRound, Star, CalendarRange, PhoneCall, Users, Clock, Banknote
export function targetIcon(name: string | undefined): LucideIcon; // unknown/empty → FileSpreadsheet
```
TargetPicker card (stretched-button pattern, no nested interactive elements):
- Wrapper `role="radiogroup" aria-label="Import target"`; each card `GlassCard interactive` containing a `<button type="button" role="radio" aria-checked={isSelected}>` holding the title, with `after:absolute after:inset-0` covering the card. Selected: `ring-2 ring-primary` + a check badge.
- Header: `IconWell tone="info"` with `targetIcon(target.icon)`, title, field-count badge top-right ("{n} fields").
- Description `line-clamp-3` (full text in `title`).
- Footer `border-t`: existing `ImportSampleButton` for that target (`relative z-10`, so it stays separately clickable) with the template filename in mono (from the existing button's API; do not invent filenames).
- Arrow keys move selection within the radiogroup (roving tabindex); Enter/Space select.
- Page KPI strip (only real numbers): Targets `{targets.length}`; Imports run `{batches.length}` and Rows imported `Σ(created_count + updated_count)` from the same history query `ImportHistoryTab` already uses (reuse its query key; if history is paginated, label "last {n} imports"); Last import `created_at` relative via `Intl.RelativeTimeFormat`. If the history query is not available to this viewer, show only Targets.
- Stepper: numbered steps with connector line ("1 Select target" … "5 Results"), current step `aria-current="step"`, using `SectionHeading` for the active step's title.

- [ ] **Step 1: Tests**: `targetIcon("Cpu") === Cpu`, `targetIcon("Nope") === FileSpreadsheet`, every backend name has an entry (inline the 14 names); TargetPicker renders an icon for every target (no empty slot), cards are radios with `aria-checked`, ArrowRight moves selection, the template button click does not select the card.
- [ ] **Step 2: Run** `npx vitest run src/plugins/data_import` → FAIL on new tests.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; plugin-removal check: `grep -rn "plugins/data_import" frontend/src | grep -v "^frontend/src/plugins/data_import/"` shows only `frontend/src/plugins/index.ts`.
- [ ] **Step 5: Commit** `feat(data-import): real target icons, accessible target picker, KPI strip, stepper`.
- [ ] **Step 6: Page Gate** (`--only=data-import`): both tabs; select each target with the keyboard; download one template (200); walk to "Upload file" and back without uploading.

### Task 14: Leave Balances (`/admin/leave-balances`)

**Files:** Create `pages/admin/components/LeaveBalanceKpis.tsx` (+ test); Modify `pages/admin/LeaveBalancesPage.tsx`, `pages/admin/hooks/useLeaveBalanceColumns.tsx`, `pages/admin/hooks/leaveBalanceFilters.ts` (+ test)

**Interfaces:**
```ts
// leaveBalanceFilters.ts additions
export interface BalanceTotals { allocated: number; used: number; pending: number; atRisk: number; usedPct: number | null }
export function computeBalanceTotals(rows: LeaveBalance[], today: Date): BalanceTotals; // atRisk = Σ available_days of isExpiringSoon rows; usedPct null when allocated = 0
export function filterBalances(rows: LeaveBalance[], f: { year?: number; type?: LeaveBalance["leave_type"]; expiringOnly: boolean }, today: Date): LeaveBalance[];
// LeaveBalanceKpis.tsx
export const LeaveBalanceKpis: React.FC<{ totals: BalanceTotals; expiringOnly: boolean; onToggleExpiring(): void }>;
```
Changes:
- KPI strip over the **currently filtered** rows: Allocated `{allocated}d`, Used `{used}d` (delta flat `"{usedPct}% of allocated"`), Pending `{pending}d`, Carry-over at risk `{atRisk}d` (tone warning when > 0; `onClick` toggles the existing `expiring` URL filter; label from `CARRYOVER_WINDOW_DAYS`).
- Toolbar `FilterChipRow`s: Year (All + distinct `year` desc), Type (All / Vacation / Sick, only values present), plus the existing "Expiring ≤ 60 days" chip moved into the row. URL params `year`, `type` (same `replace: true` pattern as `expiring`); default "All", so the default view is unchanged.
- Columns: Employee via `UserCell` (initials avatar); numbers right-aligned `tabular-nums`, `Intl.NumberFormat` max 1 decimal (22.0 → 22); new derived Utilization column (bar `used/total`, `role="img"`, `aria-label="{pct}% used"`, tone track); Available bold; Expires with warning tone when `isExpiringSoon`; actions via `RowActions` (View audit / Edit / Delete).
- Footer status line: "{n} balances" (`aria-live="polite"` when filters change).

- [ ] **Step 1: Tests**: `computeBalanceTotals` on a 3-row fixture (one expiring carry-over) → exact numbers, `usedPct` null for empty; `filterBalances` by year/type/expiring; `LeaveBalanceKpis` click toggles; page test: year chip sets `?year=2026` and the KPIs recompute.
- [ ] **Step 2: Run** `npx vitest run src/pages/admin/hooks/leaveBalanceFilters.test.ts src/pages/admin/components/LeaveBalanceKpis.test.tsx src/pages/admin/LeaveBalancesPage.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(leave-balances): KPI strip, year/type chips, utilization column, row actions`.
- [ ] **Step 6: Page Gate** (`--only=leave-balances`): open each of the 10 audit popups captured in `INDEX.md`, Add Balance dialog (cancel), Edit (cancel), Delete confirm (cancel), Import button menu.

### Tasks 15–19: Remaining pages

Each task below follows the same five-step cycle as Task 14 (test → fail → implement → pass → commit) for the listed changes, then runs the Page Gate for its slugs. Breadcrumbs (Task 5), density (Tasks 7, 9) and RowActions (Task 7) already apply; these tasks add the page-specific items only. **Do only what is listed; YAGNI.**

| Task | Route(s) / slug(s) | Page-specific changes (real data only) | Tests to add/update |
|---|---|---|---|
| **15 People** | users, teams, techs, clients, hbpr-assignments, skills-catalog, skills-settings | **Users:** `UserStatsCards` → `iconTone` + `delta` ("Total users" ← `new_hires_30d` only if that page already has the overview; otherwise no delta); username cell gains the `UserCell`-style initials avatar + email as the second line (drop the separate Email column from default visibility only if `ColumnVisibilityMenu` keeps it toggleable); actions visible via the sticky column. **Teams:** `TeamsTableRow` actions via `RowActions`; member count `tabular-nums`. **Tech/Clients:** row actions via helpers (done), compact empty states. **HBPR:** Active/Archive tabs keep counts in a `FilterChipRow`-styled tab badge. **Skills catalog/settings:** chip filters via `FilterChipRow`; compact empty states. | `UserStatsCards.test.tsx`, `useUserColumns` avatar test, `TeamsTableRow.test.tsx`, `SkillsCatalogWorkspace` chip test |
| **16 Operations** | calendars, overtime-logs, standby-logs, leave-requests | Status filter chips → `FilterChipRow` with counts from the already-loaded list/stats (`useLeaveRequestStats`, OT/standby stats); `OvertimeAggregateCard`/`StandbyAggregateCard` → `StatCard` with `iconTone`; approve/reject/edit/delete via `RowActions` (success/danger tones); Calendars tabs: compact empty states; HolidayTable actions via helper. Monthly-lock rules unchanged: `canDelete`/`?ignore_date_filter=true` logic untouched (Hot Invariant). | `useOvertimeColumns`/`useStandbyColumns` tests, `LeaveRequestsTable.test.tsx`, `HolidayTable.test.tsx` |
| **17 Governance/Tools** | resource-access, plugins, ticket-kpi-mappings | **Plugins:** `IconWell` per card (plugin metadata icon if present, else `Puzzle`), status as tone badge, "Initialize" demoted to `ghost` with tooltip explaining it, "Open" stays a link; grid fills width with no orphan (`auto-fit minmax(22rem,1fr)`). **Resource access:** group cards `interactive` only if they navigate; member list row actions via `RowActions`. **Ticket KPI:** 3 tabs keep content; tables use `RowActions`; empty states compact. | `PluginManagementGrid.test.tsx`, `ResourceAccessPage.test.tsx` |
| **18 Payroll** | payroll-wages, payroll-runs, payroll-calendar, payroll-settings | **Runs:** KPI strip from the loaded runs list only (Runs, Drafts, Latest finalized net with `Intl.NumberFormat` + "Lek" as already rendered); Rule Set cell `truncate` + `title` (rows no longer wrap to 2 lines); status via `StatusBadge`; Period mono. **Wages:** row actions via `RowActions`. **Calendar/Settings:** section headings via `SectionHeading`; no logic change. Scoped-TL payroll rules untouched (Hot Invariant: run vs line scope). | payroll runs list test (create if missing) for KPI totals |
| **19 Extensions/System** | analytics (done in 11), control-room-access, global-settings, audit-logs, backup-restore | **Audit logs:** `AuditLogStatsCards` → `iconTone`; timestamp column `whitespace-nowrap` short `Intl.DateTimeFormat` with full value in `title`; "View" text button → `RowActions` single Eye action (same dialog). **Global settings:** logo file input styled through the control kit (hidden native input + `Button variant="outline"` "Choose file" + filename text; same `onChange`); "Carry-over Expiry Month" number input → `Select` of month names whose values are `"1"`…`"12"` (same payload). **Backup & Restore:** two tabs, compact empty states, destructive restore keeps `ConfirmDialog`. **CR access:** chip filters via `FilterChipRow`. | `GlobalSettingsPage.test.tsx` (month select submits `3`), `AuditLogStatsCards.test.tsx`, `useAuditLogColumns.test.tsx` |

For every row: Page Gate with `--only=<slugs>`; commit per task: `feat(<area>): visual lift for <pages>`.

### Task 20: User-frontend spillover, docs, final verification, summary

**Files:** Modify `CLAUDE.md` (one Hot Invariant line), `.devin/context/03-FRONTEND-PATTERNS.md` (§20 "Lift, density, row actions"), `docs/ui-control-kit.md` (FilterChipRow, RowActions), `AGENTS.md` (dated entry); Create `admin-gui-screenshots/SUMMARY.md` (untracked deliverable)

- [ ] **Step 1: Spillover check.** Tokens (Task 1) and primitives (Tasks 2–4, 7, 9) also change the user app. Run `node scripts/visual-verify.mjs capture --theme=light` and `--theme=dark` for roles `employee,tl` and compare with the stored fingerprints (`verify`). Fix regressions in the primitive, not per page.
- [ ] **Step 2: Full verification (once).** From the repo root and `frontend/`, each on its own line:
  ```bash
  py -3.14 manage.py check
  py -3.14 manage.py makemigrations --check
  cd frontend
  npx tsc --noEmit
  npx vitest run
  npx eslint src
  node --test scripts/admin-routes.test.mjs scripts/control-audit.test.mjs scripts/surface-audit.test.mjs scripts/table-header-audit.test.mjs
  node scripts/control-audit.mjs --strict --exclude=src/plugins/engagement
  node scripts/surface-audit.mjs --strict --exclude=src/plugins/engagement
  node scripts/table-header-audit.mjs
  node scripts/modal-audit.mjs
  npm run build
  node scripts/admin-shots.mjs --tag=after
  ```
  Then the Playwright admin specs per the e2e runbook (`DJANGO_SETTINGS_MODULE=config.settings_e2e npx playwright test --project=chromium e2e/admin-dashboard.spec.ts e2e/visual-guards.spec.ts e2e/role-workflows.spec.ts`). Expected: all green; `after/report.json` empty lists for 27 × 2.
- [ ] **Step 3: Docs.** `CLAUDE.md` already carries the "Admin visual lift (2026-10-10)" Hot Invariant and the Task Router row for "breadcrumb, row actions, kpi card, empty state" → `03-FRONTEND-PATTERNS.md` §20 (written by the first run). **Update, never duplicate**: append the review traps (1)–(5) — sticky-cell composition, `group/row` in the base row class, D1 as identity not contrast, `scopeLabel` wording, and the Page-Gate stop rule — and add a dated `AGENTS.md` entry for what changed. `.devin/` is gitignored, so `CONTEXT.md`/`03-FRONTEND-PATTERNS.md` edits do not reach other agents; the tracked `CLAUDE.md` + `AGENTS.md` + `docs/*.md` are the ones that do.
- [ ] **Step 4: `SUMMARY.md`.** Per page (27 rows): what changed, `before/light|dark/…` and `after/light|dark/…` paths, issues not fixed (with reason). Include F11 (report history needs a backend writer) and any pre-existing console/network errors.
- [ ] **Step 5: Commit** `docs: admin visual lift invariants and patterns`.

---

## Appendix A: Running the mockup (reference only; never copy its files)

Copy `C:\Users\EDEMNUSHIW\Downloads\AdminGUI` to a scratch folder (not the repo). In the copy's `package.json`: delete `devDependencies.esbuild` and `devDependencies.tsx` (they pin esbuild 0.25 against vite 8's ^0.27), delete `dependencies.express` and `devDependencies["@types/express"]` (unused by the client), add `dependencies["react-is"]: "^19.0.0"` (recharts peer). Then `npm i --legacy-peer-deps` and `npx vite --port=3999 --host=127.0.0.1 --strictPort`. It renders with one harmless `favicon.ico` 404. Navigation is in-memory (no URLs): click sidebar labels. Its dark mode is broken (F10).

## Appendix B: Mockup patterns → real implementation

| Mockup pattern | Adopt as | Not adopted |
|---|---|---|
| `card-modern` hover border-blue + lift | `.surface-lift` on interactive cards only | lift on static cards; `transition: all` |
| KPI card: icon chip top-right, big number, trend line | `StatCard iconTone + delta` | invented sparklines (no time-series in most payloads) |
| `People / Directory` breadcrumb | `AdminBreadcrumbs` | fake `dmf-enterprise / admin-console / v2.6` path |
| "SECTION A" eyebrows | `SectionHeading` on Reports, Analytics, Data Import | eyebrows inside the draggable dashboard grid |
| Row: avatar initials + action icons | `UserCell` avatar + `RowActions` (hover-reveal) | always-visible 4-icon clutter on desktop |
| Report cards with metadata row + signed badge | `ReportCatalog` with period/records/total/scope | "RSA-2048 Signed", fake sizes, fake authors |
| Data import: field-count badge, template link | badge + existing `ImportSampleButton` | fake template filenames, "99.98% pass rate" |
| Leave balances: KPI strip, team chips, utilization bars | KPIs + year/type chips from loaded rows + utilization column | team chips (balances carry no team field) |
| Inter font, raw slate/blue palette, `#f8f9fc` | none (D2, tokens) | all |
