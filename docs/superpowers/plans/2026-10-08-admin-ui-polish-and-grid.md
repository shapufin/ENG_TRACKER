# Admin UI polish, widget consolidation and draggable grid

Date: 2026-10-08 · Branch base: `main` @ 4e22c7f · Status: **PLAN, not started**
Mockup: `C:\Users\EDEMNUSHIW\Downloads\AdminGUI` (React 19 + Tailwind v4, slate palette). It is a visual reference only; production tokens stay the source of truth.

## 0. Outcome and success criteria

**Outcome:** the admin area (and every shared primitive it uses) reads as one modern, compact, calm UI in light and dark; the Admin Dashboard is a compact, de-duplicated grid whose widgets the admin can reorder and resize with the mouse (and keyboard), without breaking phone/tablet layout.

Checkable criteria (each is verified in Phase 7):

| # | Criterion | Evidence |
|---|---|---|
| C1 | Light mode: card vs page, card vs border, input vs card are visibly separate | measured contrast ratios pinned in `tokens.test.ts` (card edge >= 1.6:1 on card, field edge about 2:1 + focus ring >= 3:1; the page/card fill step stays about 1.1:1 on purpose, separation comes from edge + shadow; D1 = soft edge, decided 2026-10-08) + before/after screenshots |
| C2 | No `Personal` toggle on the Admin Dashboard | `DashboardSwitcher` not rendered on `/admin`; test asserts absence; non-admin dashboards unchanged |
| C3 | Dashboard default view shows <= 12 widgets above the fold-and-a-half, zero duplicated metrics | widget inventory table (section 2) + e2e count |
| C4 | Drag to reorder, resize, persist per user, reset works; keyboard path exists | Playwright drag spec + vitest on layout mapper |
| C5 | No horizontal scroll and no overlap at 375 / 768 / 1280 / 1920 | Playwright viewport spec asserting `scrollWidth <= clientWidth` |
| C6 | Every input, textarea, select, search field and toolbar control comes from ONE control kit (same height, radius, edge, focus) | `scripts/control-audit.mjs` exit 0 (section 4.4) + computed-style probe: all controls in one toolbar report the same height + screenshots of 5 pages |
| C7 | No regression | `tsc`, eslint, vitest, build, `modal-audit`, `table-header-audit`, e2e admin-dashboard + visual-guards green |

## 1. What the audit found (live, `/admin`, light, 1440px, e2e fixture admin)

1. **Ragged grid.** `StatsWidgets`, `OverviewSection`, `PeopleSection`, `TrendsSection` and the chart row are each their own `grid` with different column counts, so rows end with holes (see Overview: 4 + 3 + 1 tiles, then a half-empty row). Nothing aligns across sections.
2. **Duplicated metrics.** Total Users and Headcount both say 44; Total Teams repeats inside Coverage Gaps; Pending Approvals / Pending Backlog / Approval Status / Approval Aging all describe one queue; Overtime Hours / Hours Overview / OT & Standby Trend overlap; the seven "shortcut" tiles (`users, teams, clients, permissions, calendar-mgmt, reports, holiday-balances`) duplicate the sidebar.
3. **Light mode has no layering.** Page `--background 220 18% 94%` against `--card 0 0% 100%` with `--border 214 22% 78%` produces a grey slab with white boxes whose edges are heavy lines: the card edge, the outline buttons (`Presets`, `Export PDF`, `Reset`, `Customize`) and the tabs all use the same line weight, so everything looks equally important. `GlassCard` also lifts and re-borders on hover for cards that are not clickable.
4. **Header bloat.** Title block, role switcher, freshness, refresh, four outline buttons: ten controls on one wrapped row at 1440px.
5. **Form controls are not centralized (owner clarification: search bars and wrapper divs like `relative w-full max-w-sm flex-1 sm:w-auto`).** Measured: 33 files draw a `<Search>` icon by hand; `pl-8` (13x), `pl-9` (12x), `pl-10`, `pl-11` are used to clear that icon; heights range `h-8/9/10/11/12` on `Input`/`SelectTrigger`/`Button`; `DataTable` search is `h-11 pl-9 sm:h-9` while `pages/admin/components/filterBarParts.tsx` has its own local `SearchInput` at `h-12 pl-11`; 7 raw `<input>` elements outside `ui/`; the layout wrapper `relative w-full max-w-sm flex-1 sm:w-auto` is re-typed per toolbar (`DataTable.tsx:302`). On `/admin/users` alone there are three different search looks (sidebar page search, filter-chip panel, table search). Computed on screen: field edge is `rgb(131,145,165)` (a dark slate hairline on white, the 3:1 value), the outline buttons use the same colour, chips use `rgb(187,197,211)`: two border strengths for controls on one row. The same page nests grey page > grey filter panel > white table card, so the white card sits on grey twice.
6. **Layout data already supports a grid.** `UserDashboardLayout.layout` is a `JSONField` (`apps/dashboard/models/core.py:97`) and `defaultAdminLayout` already carries `{id, position{x,y}, size{w,h}}` and `columns`; today the positions are ignored. **No migration is needed.**

## 2. Widget consolidation (the decision table)

Goal: 28 selectable widgets become ~16, grouped in the existing six sections (`ADMIN_DASHBOARD_SECTIONS`). Ids that are removed are mapped, never deleted from saved layouts (see 5.3).

| Keep / new id | Replaces | Default size (12-col units w x h) | Section |
|---|---|---|---|
| `kpi-strip` (one compact card: Users, Teams, Pending, OT hrs, Leave util, Carryover as 6 mini stats with sparkline-free numbers) | `total-users`, `total-teams`, `pending-approvals`, `overtime-hours`, `org-headcount`, `leave-utilization`, `carryover-expiry` | 12 x 2 | Overview |
| `coverage-gaps` | (unchanged; absorbs `org-headcount` "new in 30d / never logged in") | 4 x 4 | Overview |
| `approval-queue` | `pending-backlog`, `approval-status`, `approval-aging`, `approver-sla` as tabs inside one card (Status / Aging / Speed) | 6 x 5 | Approvals |
| `rejection-analysis` | unchanged | 6 x 5 | Approvals |
| `hours-trend` | `hours-overview`, `ot-standby-trend` (period selector kept) | 8 x 5 | Hours & Trends |
| `ot-by-client` | unchanged | 4 x 5 | Hours & Trends |
| `team-comparison` | unchanged | 6 x 5 | Hours & Trends |
| `leave-trend` | unchanged | 6 x 5 | Leave |
| `who-is-out` | unchanged | 4 x 5 | Leave |
| `role-distribution` + `tech-distribution` | merged as two tabs in `people-mix` | 4 x 5 | Overview |
| `period-close` | unchanged | 4 x 3 | System |
| `backup-status` (superuser) | unchanged | 4 x 3 | System |
| `recent-activity` | unchanged (audit permission gated) | 4 x 5 | System |
| `shortcuts` (one compact icon-row card, 7 links) | `users, teams, clients, permissions, calendar-mgmt, reports, holiday-balances` | 12 x 1 | Shortcuts |

Implementation rule: **the underlying hooks and API requests stay as they are** (`admin_overview`, `admin_trends`, `admin_people` already batch). Only the presentational layer merges. This keeps the backend untouched and the three section fetches lazy as they are today.

## 3. Technology decision (needs the owner's yes: CLAUDE.md forbids new packages without permission)

| Option | Drag | Resize | Responsive | New dep | Verdict |
|---|---|---|---|---|---|
| A. `react-grid-layout` v2 (`ResponsiveGridLayout`, `dragConfig.handle`, `resizeConfig`, `useContainerWidth`) | yes | yes (all edges) | yes: per-breakpoint `layouts`/`cols` | 1 (it pulls `react-draggable`, `react-resizable`) | **Recommended.** Only option that gives mouse resize without writing it |
| B. `@dnd-kit/sortable` on CSS grid with S/M/L span presets | yes (keyboard sensor built in) | presets only, no free resize | native CSS, trivially responsive | 1 (`@dnd-kit/core` already installed) | Fallback if A is refused |
| C. Hand-rolled pointer events | yes | yes | yes | 0 | Rejected: a11y + touch + collision code we would own |

Verified API (context7 `/react-grid-layout/react-grid-layout`, README): v2 requires React 18+; props `layouts`, `breakpoints` (default lg 1200 / md 996 / sm 768 / xs 480 / xxs 0), `cols` (12/10/6/4/2), `margin`, `containerPadding`, `onLayoutChange(layout, layouts)`, `onBreakpointChange`; grouped configs `gridConfig`, `dragConfig` (`enable`, `handle`, `cancel`, `bounded`), `resizeConfig` (`enable`, `handles`), `compactor`, `positionStrategy`; hook `useContainerWidth`; entry points `react-grid-layout`, `/core`, `/legacy`. **Anti-patterns:** do not use the v1 flat props (`isDraggable`, `isResizable`, `WidthProvider`) from `/legacy`; do not assume names not listed above, re-read the installed `.d.ts` in Phase 0 before coding.

Responsiveness contract (keeps C5 true):
- Below `sm` (768) the grid is **not** a grid: render a single-column stack in saved order, drag and resize off (touch scroll must never be hijacked). Reorder on phones is the existing Customize dialog list.
- >= 768: 6 cols; >= 1200: 12 cols. Layouts are stored per breakpoint (`lg`, `md`) and derived for others.
- Drag only from a visible grip button in the card header (`dragConfig.handle`), so charts, tooltips and text selection keep working. Edit affordances (grip, resize corner) appear only in an explicit **Edit layout** mode; outside it the page is a static, clean dashboard. This also removes the accidental-drag risk and the hover noise.
- Keyboard: grip button focusable; `Alt+Arrow` moves one cell, `Alt+Shift+Arrow` resizes; announce via an `aria-live="polite"` region. (RGL has no built-in keyboard support, so this is our code, mapped onto the same layout state.)
- `prefers-reduced-motion`: disable RGL transitions through CSS (`.react-grid-item { transition: none }` under the media query) and use `lib/motion.ts` tokens elsewhere.

## 4. Visual system (tokens first, then primitives; call sites last)

Principle from the audit: **fix it in the token or the primitive, never per call site** (existing rule from the button work, CLAUDE.md "Button look is decided in `button.tsx`").

### 4.1 Light tokens (`frontend/src/index.css` `:root`, pinned by `src/theme/tokens.test.ts`)
Three surface steps instead of grey-vs-white: `--background` (page, lighter and cooler than today), `--card` (white), `--surface-sunken` (wells for inputs, code, table zebra, chart plot areas). Hairline borders (soft) for containers, a separate stronger `--input` edge only for form controls.

| Token | Now | Proposed (to be measured, not guessed) |
|---|---|---|
| `--background` | `220 18% 94%` | `220 20% 96.5%` (page) |
| `--card` | `0 0% 100%` | unchanged |
| `--border` | `214 22% 78%` | `214 20% 86%` + card gets a 2-layer shadow so the edge comes from elevation, not a dark line |
| `--surface-sunken` | `220 18% 91%` | `220 20% 94%` (wells inside white cards) |
| `--input` | `215 16% 58%` | split into `--control-edge` (about `214 16% 72%`) per 4.4 item 2; decision D1 in section 10 (soft edge + ring vs strict 3:1) |
| `--muted-foreground` | `220 10% 40%` | `220 10% 36%` (>= 4.5:1 on card and on page) |
| elevation | `shadow-glass` | `--shadow-card: 0 1px 2px hsl(222 47% 11% / .06), 0 1px 3px hsl(222 47% 11% / .04)`; `--shadow-pop` for popovers |

Dark values are not touched except where a changed token name requires it. Update `tokens.test.ts` in the same commit (it pins values by regex; a comment containing `.dark` once broke 11 assertions, keep the block flat). Contrast is computed with a small script in the scratchpad, results pasted into the test as numbers.

### 4.2 Primitives (each is a single file; every consumer gets the fix)
| File | Change |
|---|---|
| `components/ui/GlassCard.tsx` | static cards: `border-border/60 bg-card shadow-card`, no `backdrop-blur`, **hover lift only when `interactive` prop** |
| `components/ui/card.tsx` | same surface recipe so non-glass cards match |
| `components/dashboard/ChartCard.tsx` | compact header (`px-4 py-3`), `min-h` removed in favour of grid-owned height, optional `actions` slot reserved for the grip/menu |
| `components/ui/textarea.tsx`, `input.tsx`, `select.tsx` trigger | all consume the shared `controlSurface` recipe from 4.4 (no per-file class strings) |
| `components/ui/button.tsx` | keep variants; add `ghost`-first toolbar usage (see 4.3); no change to outline tokens beyond 4.1 |
| `components/ui/tabs.tsx` | segmented pill with sunken track (`bg-surface-sunken`) + white active pill, matches mockup |
| `components/ui/tableStyles.ts` | **do not edit** (Table header contract is a deliberate override; re-run the audit only) |

### 4.3 Page chrome (admin)
- Remove `DashboardSwitcher` from `AdminDashboardPage` (and the `handleDashboardChange`/`availableDashboards` plumbing that only fed it). Other dashboards keep their switcher; Admin remains reachable from the sidebar.
- Toolbar: title row = title + freshness + refresh (icon only, labelled); **one** `Edit layout` toggle; `Presets`, `Export PDF`, `Reset`, `Customize` move into a single `…` actions menu (existing `DropdownMenu`). Result: 3 visible controls instead of 8.
- Insights strip: collapse to a single-line banner with `n of m` and a "View all" popover; section tabs become the new segmented control and sit in the same row as the toolbar at >= 1024px.

### 4.4 Control kit: one definition for every field (the fix for the search-bar / wrapper inconsistency)

**Rule:** a control's height, radius, fill, edge, text size, placeholder and focus ring are defined once in `components/ui/controlSurface.ts` (a `cva`), the same way `tableStyles.ts` defines table headers. Pages compose; they never restyle.

1. **Tokens** (`index.css`, light and dark): `--control-h-sm 2rem`, `--control-h 2.25rem`, `--control-h-lg 2.5rem`; `--control-radius` (= `--radius-control`); `--control-edge`, `--control-edge-hover`, `--field-bg`. Under `@media (pointer: coarse)` the default height rises to 2.75rem (replaces the ad-hoc `h-11 sm:h-9` pairs). Density is therefore one place, never per-page `h-*`.
2. **Edge decision (owner to confirm, D1).** Today's `--input` (`215 16% 58%`) gives a 3:1 boundary but reads as a dark outline on white; that is the "strange in white mode" look. Proposal: `--control-edge` about `214 16% 72%` (roughly 2:1) plus `shadow-xs` and a `--field-bg` one step off the card, with 3:1 guaranteed by the focus ring and by an always-visible icon and placeholder (WCAG 1.4.11 only mandates the edge when it is the sole cue). Fallback for strict 3:1: keep `58%` for fields only and soften the adjacent outline buttons and chips so a toolbar carries one edge strength. Numbers are measured by script and pinned in `tokens.test.ts`.
3. **Sizes by prop, not classes:** `Input`, `Textarea`, `SelectTrigger`, `Button` take `size: "sm" | "md" | "lg"` backed by the same height tokens, so a mixed toolbar is aligned by construction.
4. **New `SearchField`** (`components/ui/SearchField.tsx`): `type="search"`, leading icon in a fixed slot (padding comes from the recipe, no `pl-*` hacks), clear button when non-empty (`aria-label="Clear search"`), optional shortcut hint (`kbd`), `loading` spinner, `role="search"` wrapper, `autoComplete="off"`, `spellCheck={false}`, `enterKeyHint="search"`, optional debounce, `Esc` clears, accessible name from `aria-label` (a placeholder is not a label). Replaces the 33 hand-built search bars, `filterBarParts.SearchInput` and the `DataTable` block.
5. **New `FilterToolbar` primitives** (`components/ui/FilterToolbar.tsx`): `FilterToolbar` (flex, wrap, `gap-2`, `items-center`), `FilterToolbar.Search` (the `relative w-full max-w-sm flex-1 sm:w-auto` wrapper, written once, with a sane `min-w`), `FilterToolbar.Group` (trailing actions), `FilterToolbar.Chips` (single scrollable, scroll-snap row on phones instead of wrapping to four lines). Replaces every per-page wrapper div.
6. **Surface rule (ends grey-in-grey-in-grey):** at most two surface levels per page, *page* and *card*. A filter or chip panel is not a third grey card: it is a borderless toolbar row on the page, or the card's own header strip (`border-b border-line-subtle`). A toolbar and the table it filters live in one card. `GlassCard` gets `variant="flat"` (no shadow, hairline) for the rare nested case.
7. **Chips and segmented controls:** one `Chip`/`ToggleChip` recipe at `--control-h-sm` (today `Employees`, `Italian TL`, `HBPR` are 32px bordered buttons next to 36px fields).
8. **Forms** (`FormField`, `FieldLabel`): label above, helper `text-xs text-muted-foreground`, error text with icon and `aria-describedby`, required marker, textarea with `rows` and an auto-grow cap, character counter where a limit exists, `resize-y` only.
9. **Guard script `frontend/scripts/control-audit.mjs`** (same pattern as `modal-audit.mjs` and `table-header-audit.mjs`: text-based, with its own evasion tests, run in CI next to them). Fails on: a `<Search` icon beside an `<Input` outside `SearchField`; `pl-(8|9|10|11)` on an `Input`; `h-(8|9|10|11|12)` on `Input`/`Textarea`/`SelectTrigger`; raw `<input|<textarea|<select` outside `components/ui` (allow-list: file, checkbox and radio inputs, `CommandPalette`, `HeaderSearch` until migrated); the `max-w-sm flex-1` wrapper literal outside `FilterToolbar`.
10. **Runtime guard:** extend `e2e/visual-guards.spec.ts` with a probe that, on six pages, collects the fields and buttons inside each `FilterToolbar` and asserts identical `getBoundingClientRect().height` and `border-top-color`.

Web Interface Guidelines items folded in (re-fetch the live rule list in Phase 7 and fix any drift): visible `:focus-visible` rings (never bare `outline-none`), correct `autocomplete`/`inputMode`/`type` per field, paste never blocked, `touch-action: manipulation` on controls, `tabular-nums` for numbers in KPIs and tables, `text-wrap: balance` on headings, `color-scheme` per theme so native scrollbars and pickers follow, `<meta name="theme-color">` per theme, ellipsis character in loading labels, `aria-live` for async result counts, reserved skeleton heights so nothing shifts.

## 5. Dashboard grid implementation

### 5.1 Files
- New `pages/admin/components/dashboard-grid/` : `DashboardGrid.tsx` (RGL wrapper + breakpoint stack fallback), `WidgetShell.tsx` (grip, size menu, header), `gridLayout.ts` (pure mapping: saved layout <-> RGL layout per breakpoint, migrate/prune), `useGridKeyboard.ts`, tests for each.
- Change `AdminDashboardWidgets.tsx` to a registry-driven render: `widgetRegistry` maps id -> `{component, minW, minH, defaultSize, section, needs: 'overview'|'trends'|'people'|null}`. Sections stop owning their own grids; `OverviewSection`/`TrendsSection`/`PeopleSection` keep only the shared query hook and lazy boundary, and export widget components.
- Change `config/dashboardWidgets.ts` (new ids, `defaultSize`, `section`), `components/dashboard/widgetRegistry.ts` (`defaultAdminLayout` rewritten for 12 cols), `config/dashboardPresets.ts` (preset id lists), `CustomizeDashboardModal` (group by section, show the merged widgets).
- `DashboardContext.tsx`: no new endpoints; keep the ordered save queue; add `version: 2` and `layouts?: { lg, md }` to the stored JSON.

### 5.2 Backend
No model change. Check `apps/dashboard/serializers.py` / viewset for layout validation: if it validates shape, extend it to accept `version`, `layouts`, `columns` (add a test first). Cap `widgets` length and clamp `x,y,w,h` ranges server-side (defence against junk JSON).

### 5.3 Migration of saved layouts (no one loses a widget)
`gridLayout.migrate(saved)`: if `version !== 2`, map old ids through the replacement table in section 2 (`total-users` -> `kpi-strip`, `pending-backlog` -> `approval-queue`, ...), de-duplicate, drop unknown ids, then place by the new default positions. Pure function, table-driven test with every old id.

### 5.4 Invariants to keep (from CLAUDE.md Hot Invariants)
- admin aggregates stay staff-only; new widgets opt-in, never forced into `defaultAdminLayout` beyond the list above; superuser-only widgets still filtered for non-superusers.
- Any admin mutation that changes aggregates still calls `invalidateAdminDashboard(qc)` (exact keys).
- Layout saves go through the ordered queue (concurrent GET+PUT saves race and drop toggles): drag-stop and resize-stop must call `updateLayout` once per gesture, never on every `onLayoutChange` tick.
- Heavy libs: `html2canvas`/`jspdf` stay dynamic (`ExportDashboardPdfButton`); RGL is imported only by the admin dashboard route chunk, and PDF capture must still find `[data-chart-section]` on each widget root.
- Plugin removal safety: nothing outside `frontend/src/plugins/<name>` imports plugin modules; the grid does not touch plugins.
- Motion: any framer-motion use gated by `useReducedMotion`/`useMotionTransition`.

## 6. Sweep strategy for "a lot of files" (pattern matching, not file-by-file)

Order of leverage: **tokens (1 file) -> primitives (~8 files) -> automated sweeps (many files, mechanical) -> hand-polish of ~10 admin pages**.

Sweeps, each = one commit, each with a grep gate that must return the stated count:

| Sweep | Find | Replace | Gate |
|---|---|---|---|
| S1 stray fills | `bg-white`, `bg-slate-*`, `bg-gray-*`, `bg-zinc-*`, raw hex in `frontend/src/{pages,components}` | `bg-card` / `bg-surface-sunken` / tone tokens | `rg -n "bg-(white|slate|gray|zinc)-" frontend/src --glob '!*.test.*'` = 0 (excluding documented "not migrated" list in `03-FRONTEND-PATTERNS.md` §15) |
| S2 border weights | `border-border/60`, `/70`, `/50` mixed | one of `border-border` (container) or `border-line-subtle` (inner divider) | `rg "border-border/(5\|6\|7)"` count drops to the allow-list |
| S3 `dark:` colour overrides | `dark:bg-*`, `dark:text-*`, `dark:border-*` on tone-able elements | tone tokens (which already carry the pair) | count = 0 outside `tokens` and chart files |
| S4 search bars | every file with `<Search` + `<Input` (33), `filterBarParts.SearchInput`, the `DataTable` block | `SearchField` + `FilterToolbar.Search`; delete local wrappers and `pl-*` | `node scripts/control-audit.mjs` exit 0 |
| S5 raw / overridden fields | `<textarea` (21 files), raw `<input` (7), `Input`/`SelectTrigger` height classes | shared `Textarea`/`Input`/`size` prop; remove `h-*`, `border-*`, `bg-*`, `rounded-*` overrides | same audit exit 0; `rg "<textarea" src --glob '!components/ui/**'` = 0 |
| S6 card hover | `hoverLiftClass` / `hover:-translate-y` on non-interactive cards | remove; keep on cards that are links/buttons | list reviewed by hand (small) |
| S7 micro-text | `text-\[10px\]`, `text-\[11px\]` | `text-xs` minimum (12px) unless it is a badge count | count = badge allow-list |

Method for each sweep: `rg -l` to list files, apply with a scripted `sed`/`perl` on that list in the scratchpad (not in-repo), `git diff --stat` to review size, run `tsc` + the vitest files touching the changed dirs. Tests that assert class names are updated in the same commit.

Hand-polish list (the ~10 admin pages; `pages/admin/*.tsx`, 17 files, plus shared `components/admin/*`): Users, Teams, Tech, Clients, HbprAssignments, Skills catalog/settings, Calendar sharing, Overtime/Standby logs, Leave requests/balances, Audit log, Backup, Data import, Resource access. For each: page header uses `PageShell`, filters in one `FilterBar` row, table uses the existing table contract, dialogs follow the Dialog contract (`node scripts/modal-audit.mjs` exit 0), empty/loading/error via the shared components.

## 7. Phases (each is self-contained: re-read section 6 and its own references, then run its gate)

**Phase 0: Discovery (no edits).** Read `.devin/context/03-FRONTEND-PATTERNS.md` §10-15, §18; `docs/table-header-contract.md`; `tokens.test.ts`; `GlassCard.tsx`, `ChartCard.tsx`, `StatsWidgets.tsx`, `OverviewWidgets.tsx`, `AdminQuickLinks.tsx`, `DashboardContext.tsx`, `apps/dashboard/{models/core.py,serializers.py,viewsets*.py}`, `widgetRegistry.ts`, `dashboardPresets.ts`. Install nothing. If A is approved, `npm view react-grid-layout version peerDependencies` and read the installed `.d.ts` for the exact prop names before use. Output: a one-page "allowed APIs" note appended to this plan. Screenshot baseline: capture light/dark at 375/768/1280/1920 of `/admin`, `/admin/users`, one dialog with a textarea, `/hr` page, into `frontend/e2e-observed/before/` (gitignored).

**Phase 1: Tokens + control kit (visual foundation).** TDD: first change `tokens.test.ts` to the new numbers, see red, then `index.css`, `GlassCard` (+ `flat` variant), `card`, `ChartCard`, then section 4.4: `controlSurface.ts`, `Input`, `Textarea`, `SelectTrigger`, `Button size`, `Chip`, `SearchField`, `FilterToolbar`, `FormField`, `tabs`, a test per component (Esc clears, clear button reachable by keyboard, accessible name present), and `control-audit.mjs` (warn-only until Phase 5 finishes migrating, then blocking). Contrast script output goes in the commit message. Gate: `npx vitest run src/theme src/components/ui` + eslint + screenshots of the Phase 0 set (light and dark) compared side by side. Check the "not migrated" tone list before touching status colours.

**Phase 2: Admin chrome.** Remove `DashboardSwitcher` from `AdminDashboardPage` (test first: update `AdminDashboardPage.test.tsx:63`, which currently asserts the Personal tab exists), actions menu, single Edit toggle, insights strip single line. Gate: `npx vitest run src/pages/admin src/components/dashboard`; confirm other dashboards still show their switcher.

**Phase 3: Widget consolidation (presentation only).** Build `kpi-strip`, `approval-queue`, `hours-trend`, `people-mix`, `shortcuts`; add `gridLayout.migrate` with the id table; update registry, presets, Customize dialog, PDF section ids. TDD on `migrate` first. Gate: widget tests green, `AdminDashboardFreshness` still keyed correctly (it recognises period-aware trend keys), no new requests (network panel shows the same three aggregate calls).

**Phase 4: Grid (drag/resize/persist).** Only after the section 3 decision. Add the dependency, build `DashboardGrid`, `WidgetShell`, keyboard hook, per-breakpoint persistence, stack fallback < 768, reset-to-default and presets applying a layout. Gate: vitest for mapper/keyboard; Playwright spec `e2e/admin-dashboard-grid.spec.ts` (drag by grip, resize by handle, reload persists, reset restores, 375px shows stack with no handles).

**Phase 5: Sweeps S1 to S7** in that order, one commit each, gate per sweep. S4/S5 are done in directory batches (`components/admin`, `components/calendar`, `components/analytics`, `components/layout`, `pages/admin`, `pages/hr`, `pages/team`, `plugins/*`) so each commit stays reviewable; flip `control-audit.mjs` to blocking at the end. Run `node scripts/modal-audit.mjs` and `cd frontend && node scripts/table-header-audit.mjs` after S1-S3.

**Phase 6: Admin page hand-polish** page by page using the checklist in section 6; each page is its own small PR-able commit so a regression is bisectable.

**Phase 7: Verification (superpowers:verification-before-completion).** Full pass once: `py -3.14 manage.py check`; `cd frontend && npx tsc --noEmit && npx vitest run && npx eslint src && npm run build`; Playwright (chromium + mobile-chromium) per the e2e runbook; web-interface-guidelines review of changed files (fetch the current rules, `file:line` output); a11y check (focus visible on grip/menus, `aria-live`, reduced motion); screenshots after/before at 4 widths in both themes; bundle check `ANALYZE=true npm run build` (RGL must be in the admin dashboard chunk only). Report each of C1 to C7 with its evidence.

## 8. Branching and PR slicing
One PR per phase (1, 2, 3, 4, 5, 6), squash-merge, CI green before the next; never commit or push until asked (CLAUDE.md). Phases 1, 2 and 5 are independent of the grid decision and can ship first.

## 9. Risks
- Light token change touches the whole app: mitigated by Phase 0 baselines and Phase 1 screenshots of non-admin pages; token test pins the new values.
- Merged widgets change what saved layouts mean: mitigated by the table-driven `migrate` + never deleting unknown ids from the DB until a later cleanup.
- RGL + framer-motion double animation on cards: disable the card entrance delay inside the grid.
- PDF export reads DOM sections: grid transforms must not clip; capture uses `data-chart-section` on the widget root and is re-tested in Phase 4.
- Chart `ResponsiveContainer` inside resizable items needs an explicit height from the item (use `h-full` + `min-h-0`); covered by a resize e2e step.

## 9b. UX gaps closed in this review
- **Edit mode vs section tabs:** section tabs filter widgets, so a partial grid cannot be rearranged safely. `Edit layout` works only on the **All** tab (disabled with a tooltip otherwise); entering edit mode from a section switches to All first.
- **Safe editing:** `Esc` exits edit mode; `Done` is the primary button while editing; `Reset to default` asks through `ConfirmDialog` and offers an **Undo** toast for 8s (layout snapshot kept in a ref); a small "Saved" / "Saving…" / "Couldn't save, retry" status next to the toggle, driven by the ordered save queue.
- **Min and max sizes per widget** (`minW/minH`, `maxH` for self-scrolling lists) so a chart can never be resized into an unreadable sliver.
- **Empty grid:** with every widget removed, show `EmptyState` with "Add widgets" (opens Customize) instead of a blank page.
- **Compactness without cramming:** card padding `p-4`, body 14px, labels 12px (never smaller), KPI numbers `tabular-nums`, one accent colour for emphasis, status colour only via tone tokens, section headings as quiet labels rather than extra cards.
- **Loading:** skeleton height equals the widget's grid height (no jump when data lands); one `role="status"` per section, not per widget.
- **Dark mode parity:** every phase gate captures dark as well as light; dark tokens change only where a new token requires it.
- **Forced colors / high contrast:** controls keep a real `border` (not only a shadow) so Windows high-contrast still shows field edges; checked once in Phase 7 with forced-colors emulation.
- **Keep it fixed:** add §19 "Control kit and surfaces" to `.devin/context/03-FRONTEND-PATTERNS.md`, a Task Router row (keywords: search bar, input, textarea, select, toolbar, filter, field height), a Hot Invariant in `CLAUDE.md` ("controls are decided in `controlSurface.ts`; run `control-audit.mjs`"), and a dated entry in `AGENTS.md`.

## 10. Decisions (2026-10-08)
- Q1 answered: **option A, `react-grid-layout`** approved as the one new dependency.
- Q3 answered: widget consolidation in section 2 **approved as planned**.
- Q2 answered: "text areas" = search bars, field wrappers such as `relative w-full max-w-sm flex-1 sm:w-auto`, and inputs that look odd in light mode and are not centralized. Addressed by section 4.4 (control kit) and the `control-audit.mjs` guard.
- **D1 (decided: soft edge):** field edge strength, 2:1 soft edge + ring (recommended) vs strict 3:1 edge (section 4.4 item 2).

## 11. Original questions
1. Approve adding `react-grid-layout` (option A), or take option B (reorder + S/M/L sizes, no free resize)?
2. "Text areas": I read this as (a) the `Textarea`/`Input` form fields and (b) the text-heavy content blocks inside cards. If you meant something specific (a particular dialog or page), name it and it becomes the Phase 1 acceptance screenshot.
3. Widget merges in section 2: confirm the consolidation (28 -> ~16 ids), especially replacing the 7 shortcut tiles with one compact row.
