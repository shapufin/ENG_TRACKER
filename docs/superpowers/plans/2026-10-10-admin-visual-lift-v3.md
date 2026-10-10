# Admin Visual Lift v3 — verification, residual fixes, record side panel

> **Status: PLAN ONLY — awaiting owner approval. No code changed yet.**
> Predecessor: `docs/superpowers/plans/2026-10-10-admin-visual-lift.md` (merged to `main` @ `8b9d377`).
> This plan does not rebuild the lift primitives. It closes the verification debt, fixes the measured leftovers, and adds the one new capability (record detail side panel).

## 0. Outcome and success criteria

**Outcome:** every `/admin/*` route (27) has a recorded, passing Page Gate (G1–G5) with `after/` captures, the measured token/motion/control-height leftovers are gone from admin code, and a shared record detail side panel exists and is wired for users first.

**Checkable success criteria:**
1. `admin-gui-screenshots/after-v3/{light,dark}/` holds 27 routes × 2 themes (+ tab shots); `report.json` has `consoleErrors: []` and `failedRequests: []` everywhere.
2. `node scripts/table-header-audit.mjs`, `modal-audit.mjs`, `control-audit.mjs --strict`, `surface-audit.mjs --strict` (all `--exclude=src/plugins/engagement`), `npx tsc --noEmit`, `npx vitest run`, `npm run build` all exit 0.
3. `rg -n "(slate|gray|zinc|emerald|blue|amber|red)-[0-9]|transition-all" frontend/src/pages/admin frontend/src/components/admin` returns nothing (plugin files are out of scope — see §4).
4. Users page: row click opens the side panel; Esc/cancel closes it; no request fires on open beyond what the list already loaded (same rule as the TL record dialog).

Gate failures are reported with the output, never papered over. A page whose gate cannot run is committed as `wip(visual): <page> (gate not run: G1, G3)`.

## 1. Reconciled state (Step 0.5, verified 2026-10-10)

| Check | Result |
|---|---|
| `8b9d377` is ancestor of HEAD | ✅ yes |
| Current branch | `fix/teams-columns-menu` (not `main`) — implementation branches from fresh `main` |
| Lift primitives present | ✅ `FilterChipRow`(11 files), `RowActions`(13), `AdminBreadcrumbNav`, `SeverityBanner`, `SectionHeading`, `EmptyState`(74), `.admin-canvas`, `.surface-lift`, `TABLE_STICKY_ACTIONS_*`, `control-icon-sm`, `text-dense`, `invalidateAdminDashboard` (11) |
| Harness scripts | ✅ `frontend/scripts/admin-shots.mjs`, `admin-routes.mjs` (+ test) exist. **Path note:** the prior plan named `scripts/` at repo root; they live in `frontend/scripts/`. |
| Baseline captures | ✅ `admin-gui-screenshots/before/{light,dark}` + `report.json` (all empty error lists) |
| After captures | ❌ none exist — verification debt confirmed |
| Dev servers | Vite `127.0.0.1:5173` answers 200; backend `127.0.0.1:8000` answers (404 on `/api/` root, i.e. up). Gate G1 is runnable. |
| `showmigrations` | not re-checked in this planning pass — **run before Task 1** (CLAUDE.md dev-DB rule) |
| Gate scripts | ✅ `control-audit`, `surface-audit` (+ test), `table-header-audit`, `modal-audit` all present |

## 2. Measured gaps (grep + code read, 2026-10-10)

Route numbers follow `admin-gui-screenshots/INDEX.md`.

| Route | Real gap found | Evidence | Class |
|---|---|---|---|
| 01 `/admin` | `ApprovalStatusBody` uses raw `bg-emerald-600` / `bg-amber-600` / `bg-red-600` for status bars | `pages/admin/components/dashboard-widgets/ApprovalStatusBody.tsx:59-61` | **Fix** — map to `tone-*` tokens |
| 02 `/admin/users` | `useUserColumns` badges hard-code `border-blue-500/30 bg-blue-500/15` and `border-emerald-600/30 bg-emerald-600/15` | `pages/admin/hooks/useUserColumns.tsx:33,44` | **Fix** — `tone.ts` tokens |
| 02 `/admin/users` | Row-click side panel does not exist yet (only a centred `Dialog size="xl"` bulk drawer) | `components/admin/UserBulkCommandDrawer.tsx:269` | **New** — see §3 Task 4 |
| 03 `/admin/teams` | `TeamsTableRow` has `transition-all` (motion rule violation). File appears **unused**: only referenced by `TeamsTable.tsx`, which is not imported by `TeamDataTable` / `TeamsPage`. | `components/admin/TeamsTableRow.tsx:34` | **Verify dead, then delete** (trace `find_usages` before deleting; if live, fix to `transition-[transform,box-shadow]` / `motion-reduce`) |
| 24 `/admin/control-room/access` | `h-8 w-8` icon buttons (3 sites) and raw `text-emerald-600` (ShieldCheck) — stray leftovers named in SUMMARY.md | `plugins/control_room/pages/ControlRoomAccessPage.tsx:212,223,230,239` | **Fix** — `Button size="control-icon-sm"`, `text-tone-success-text`. Plugin file: see §4 |
| 15 `/admin/reports` | `TabsList` `h-11` (tab control, not a button — check against control-kit rule) | `pages/admin/ReportsPage.tsx:119` | **Triage** — likely keep, confirm in G2 |
| 18 `/admin/data-import` | F8 (target icon slot, clickable `div` cards) — **status unknown**: the sweep recorded no per-page diff | `plugins/data_import/...` / `TargetPicker` | **Verify** in G2/G3; fix only if still present |
| 13 `/admin/leave-balances` | F1 row height — helpers reported fixed by `RowActions`; **not measured** | `components/ui/tableColumnHelpers.tsx` | **Verify** with a row-height measurement in G2 |
| 04–12, 14, 16, 17, 19–23, 25–27 | No code-level leftover found by grep. Remaining risk is behavioural, not stylistic. | — | **Gate verification only** |

Admin components still using `h-8`–`h-11` on something that is a *control* (not a decorative icon chip): `components/admin/ApprovalActionsWithView.tsx:34,43,52` (`h-11 w-11`), `components/admin/DataTableActions.tsx:13,20` (`h-8 w-8`). Both need a call-site check: if rendered in admin tables, move to `control-icon-sm`; if the component is unused, delete it.

Out of scope and **not admin routes**, noted only: `plugins/ticket_kpi/pages/TicketKPITeamPage.tsx:146,154` (`bg-blue-500`, `bg-emerald-500`), `plugins/control_room/utils/crViewHelpers.ts:20-21`. Flagged for a separate ticket — not touched here.

**Summary: 4 routes with real code gaps (01, 02, 03, 24), 3 needing verification in the gate (13, 15, 18), 20 gate-verification only.**

## 3. Decisions the owner must confirm

| ID | Question | Recommendation |
|---|---|---|
| **V3-D1** | Side panel shape. The "drawer" today is a centred `Dialog`. Options: (a) new `variant="side"` on the existing `DialogContent` (keeps one dialog primitive, needs a `modal-audit` allow-list update); (b) new `RecordSidePanel` built with a fixed `aside` and focus trap (second overlay primitive, more code). | **(a)**. Reuses the Dialog contract (one scroll region, focus handling, Esc). Width token `xl` ≈ 896 px is too wide for a panel → add `size="panel"` ≈ 480 px. Confirm you accept a new `size` value. |
| **V3-D2** | Which entity first? | **Users** (route 02). Then propose per-entity reuse; do not wire Teams/Clients/Logs in this plan. |
| **V3-D3** | Delete `TeamsTableRow`/`TeamsTable` if confirmed dead? | **Yes**, one commit, after `find_usages` confirms no importers. |
| **V3-D4** | Keep the sticky `thead` and grid/card toggle? | **Propose only**, per the brief. Not built in v3. |

No decision is needed for the verification work itself — it proceeds once you approve the plan.

## 4. Scope boundaries

- Presentation only. No API, serializer, model, migration, route path, permission, or query param change. The side panel reads the **already-loaded** list row; it fires no request on open.
- Plugin files (`plugins/control_room/**`) are touched only for the route-24 leftovers, through the same tokens. Plugin imports stay REST-only (plugin-removal safety).
- Real data only (mockup names, hubs, deltas stay out). KPI deltas remain **optional proposals** — not built unless a real payload field exists for them.
- No new dependencies. No changes to `package.json` / lockfile.

## 5. Tasks

Each task: test first (TDD where a seam exists) → fail → implement → pass → Page Gate for the pages it touches → one commit.

### Phase A — Harness + baseline sanity

- [ ] **A0 Preflight.** `py -3.14 manage.py showmigrations` (no `[ ]`); confirm `e2e_super` login works on `:5173`. If the e2e DB is stale: `prepare_e2e_db` per `reference_e2e_runbook`. Commit nothing.
- [ ] **A1 Capture `after-v3` baseline on untouched code.** `cd frontend && node scripts/admin-shots.mjs --tag=after-v3-pre`. Purpose: proves the harness works *before* any change, and separates pre-existing console/network errors from ones we introduce. Expected: `report.json` empty lists; if not, record and fix the harness first.

### Phase B — Residual token/motion fixes (routes 01, 02, 03, 24)

- [ ] **B1 Dashboard status bars → tone tokens** (route 01). TDD: `ApprovalStatusBody.test.tsx` asserts no `bg-(emerald|amber|red)-` class and that Approved/Pending/Rejected map to `bg-tone-success`/`bg-tone-warning`/`bg-tone-danger` (confirm exact token names in `tone.ts` before writing the test). Gate: G1–G5 for `dashboard`.
- [ ] **B2 Users badges → tone tokens** (route 02). TDD: `useUserColumns` test asserts tone classes. Gate: G1–G5 for `users`.
- [ ] **B3 Control-room access → kit primitives** (route 24). Replace `h-8 w-8` with `size="control-icon-sm"`, `text-emerald-600` with `text-tone-success-text`. TDD on the existing `ControlRoomAccessPage.modernization.test.tsx` (extend it, do not add a new file). Gate: G1–G5 for `control-room-access`.
- [ ] **B4 Teams row motion** (route 03): after V3-D3 confirmation, delete dead `TeamsTableRow`/`TeamsTable` (or fix motion if still live). Gate: G1–G5 for `teams`.
- [ ] **B5 Control-height call sites** — `ApprovalActionsWithView`, `DataTableActions`: move to `control-icon-sm` or delete if unused.

### Phase C — Verify-only pages (G1–G5, fix only what the gate proves)

- [ ] **C1 Data import (18):** check F8 (target icon slot, clickable cards). Fix only if still broken.
- [ ] **C2 Leave balances (13):** measure real row height (target ≈ 40–48 px, not 69 px). Fix only if still broken.
- [ ] **C3 Reports (15):** confirm `TabsList h-11` is acceptable under the control kit; decide keep vs `controlSize`. Confirm the team filter (D5 / F12) applies to totals and the scope label reads "All teams in your workspaces" under a workspace scope (trap 4).
- [ ] **C4 Remaining 20 routes:** run G1–G5 unchanged. A route that passes only gets its commit as `chore(visual): <page> gate verified` with no code change. Route-specific failures are fixed in their own commit.

### Phase D — Record detail side panel (new capability)

- [ ] **D1 Primitive** (after V3-D1): `DialogContent size="panel"` + a right-anchored layout variant in `components/ui/dialog.tsx`. TDD: `dialog.test` asserts the panel class, the single `DialogBody` scroll region, Esc closes, focus returns to the trigger. `modal-audit.mjs` must pass with the new variant (update its allow-list only if the audit requires).
- [ ] **D2 Users wiring** (route 02): row click (`<button>` on the identity cell, not the row `div`) opens `UserDetailPanel` built from the already-loaded `UserProfile` row. Action buttons inside the panel reuse the existing bulk/edit dialogs. Keyboard: Enter on the identity cell opens; focus returns on close. Gate: G1–G5 for `users` (extended click-through: open panel → close → open again).
- [ ] **D3 Report** what was reused vs new, and the per-entity list for follow-up (teams, clients, logs) — proposals only.

### Phase E — Final pass

- [ ] **E1** `npx tsc --noEmit`; `npx vitest run` (full, once); `npm run build`; the four audit scripts; `rg` from §0 criterion 3.
- [ ] **E2** `node scripts/admin-shots.mjs --tag=after-v3` (full 27 × 2). Produce a per-page diff table (`before` vs `after-v3`) in `admin-gui-screenshots/after-v3/SUMMARY.md` (untracked, like the existing one).
- [ ] **E3** Update `DESIGN.md` lift section and `CLAUDE.md` Hot Invariant only with facts that changed (side panel `size="panel"`; removed dead components). Keep the diff minimal.

## 6. Page Gate (copied verbatim from the predecessor plan — applies to every page task)

- [ ] **G1 Capture after:** `node scripts/admin-shots.mjs --tag=after-<task> --only=<slug>[,<slug>]`. Expected: exit 0, `report.json` shows `consoleErrors: []` and `failedRequests: []` for every captured route in both themes.
- [ ] **G2 Visual diff:** open `before/<theme>/<NN-slug>.jpg` next to `after-<task>/<theme>/<NN-slug>.jpg` for light and dark; write two lines per page into the task's commit body: what changed, anything that looks worse.
- [ ] **G3 Click-through:** every tab, every view/details popup, every filter chip, every row action's dialog (open, then cancel — never confirm destructive actions), keyboard Tab through the toolbar and one table row (actions must appear on focus). Console errors = 0; `/api/` requests all 2xx/3xx.
- [ ] **G4 Responsive spot-check:** 375 px and 768 px, light: `document.documentElement.scrollWidth <= innerWidth`; row actions visible without hover on the coarse-pointer emulation.
- [ ] **G5 Gates:**
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

## 7. Review focus (carried over, still binding)

1. Hover-only actions must also reveal on `:focus-within`, on selected rows, and stay visible on coarse pointers.
2. Empty/zero data: no `NaN`, no blank cards, no fake deltas.
3. Sticky actions cells keep the row hover fill (trap 2: `group-hover/row:` mirror when `getRowClassName` is passed).
4. Light/dark parity of any new surface.
5. The side panel must not fire requests on open and must not create a second scroll region.

## 8. Git

- Branch `feat/admin-visual-lift-v3` from fresh `main` (not from `fix/teams-columns-menu`).
- One commit per task. Never push or open a PR unless asked. `admin-gui-screenshots/` stays untracked.

## 9. Execution status (2026-10-11)

Branch `feat/admin-visual-lift-v3`. Gates run on the final code: tsc, table-header / modal / control / surface audits all exit 0; full vitest 533 files / 3388 tests pass; `npm run build` passes; G1 captures clean in light and dark for all 27 routes (`admin-gui-screenshots/after-v3-final*`).

Done:
- B1 dashboard status dots → tone tokens. B2 user TL/Tech badges → tone tokens.
- B3 control-room access row actions → `RowActions` (plan said `control-icon-sm` buttons; `RowActions` is the lift standard and is what the other pages use).
- B4/B5 Teams `DataTableActions` → `RowActions`; Calendars `TeamsTableRow` `transition-all` → `transition-colors`.
- D1/D2 `DialogContent side="right" size="panel"` + `UserDetailPanel`, wired on Users via identity-cell button. Verified in browser at 1440 and 375 (Escape, Edit hand-off, console clean, `/api/` 200).
- C2 leave balances: found and fixed two bugs the plan did not list: KPIs showed `NaNd`, and Total/Used showed "—" because the API sends DRF decimals as strings (`toDays()` coercion, no API change).

Corrections to this plan's own findings:
- `TeamsTable` / `TeamsTableRow` are **not** dead: `CalendarManagementPage` (route 09) imports them. Kept, not deleted.
- `ApprovalActionsWithView` (`h-11 w-11`) renders only on the TL approval dashboard, outside the admin routes. Left unchanged.
- Data import (F8) is already fixed (target icons render); no change needed.

Out of scope, noted for separate tickets: `components/ui/ErrorBoundary.tsx` uses raw `rose-*`; `plugins/ticket_kpi/pages/TicketKPITeamPage.tsx` and `plugins/control_room/utils/crViewHelpers.ts` use raw `blue/emerald`.

Known environment limits: the signed-in e2e user hits the DRF 1000/hour user throttle on full 27-route captures; re-runs must be paced. Several stale `runserver` processes exist on this machine; the one on :8000 was left alone.
