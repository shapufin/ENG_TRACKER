# Phase 6 — @tanstack/react-table 8 → 9 (Design)

Series: `docs/superpowers/specs/2026-09-28-major-dependency-upgrades-design.md`
Journal: `docs/superpowers/UPGRADE-JOURNAL.md`

## Intent

Move `@tanstack/react-table` from `8.21.3` to the stable `9.2.4` (npm `latest`)
with **no user-visible behavior change**: same sorting, global filter,
pagination, row selection, column visibility, and rendering in every table
in the app. Success = both vitest configs at the 2475 passed / 1 failed /
2476 baseline, `tsc -b` exit 0, `npm run build` exit 0, eslint at the
4-problem baseline (2 errors, 2 warnings), all from a fresh `npm ci`.

## Measured scope (not guessed)

A probe bump on a scratch branch (`npm i @tanstack/react-table@^9.2.4`, then
`tsc -b`) gave **96 type errors across ~40 files, all type-level**.

- Exactly **one** `useReactTable` call: `src/components/ui/DataTable.tsx`.
  It uses core/sorted/filtered/paginated row models, `globalFilterFn`,
  controlled `sorting`/`globalFilter`/`rowSelection`/`columnVisibility`,
  `enableRowSelection`, `enableHiding`, `enableSorting`, `getRowId`,
  `initialState.pagination`.
- 33 files import `ColumnDef` / `Column` / `Row` / `Table` / `Cell` /
  `CellContext`. In v9 each takes `TFeatures` as its **first** generic
  (`ColumnDef<TFeatures, TData, TValue>`).
- Other v9 changes that apply: `features` is a required table option;
  row models and `filterFns`/`sortFns` move onto the `features` object;
  `sortingFn` → `sortFn`; `useReactTable` → `useTable`.
- No use of `TableMeta`/`ColumnMeta` (the 25 grep hits for `meta` are
  calendar style tokens and react-query `meta`, unrelated).

## Approach (chosen)

Native v9, not the `useLegacyTable` bridge (which subscribes to full table
state and would need a second migration later).

1. **One shared feature set** exported next to `DataTable`:
   `appFeatures = tableFeatures({ rowSortingFeature, columnFilteringFeature?,
   globalFilteringFeature, rowPaginationFeature, rowSelectionFeature,
   columnVisibilityFeature, sortedRowModel, filteredRowModel,
   paginatedRowModel, filterFns, sortFns })` — include **only** features
   `DataTable` actually uses (YAGNI). Defined at module scope so the
   reference is stable.
2. **One shared type alias set** (in `tableTypes.ts` — a dedicated file, since exporting non-components from `DataTable.tsx` trips react-refresh lint; the App* aliases live there;
   column files import them from there):
   `AppColumnDef<TData, TValue = unknown> = ColumnDef<typeof appFeatures, TData, TValue>`
   plus `AppRow`, `AppColumn`, `AppTable`, `AppCell`, `AppCellContext` only as
   consumers need them. Consumers' change is then a mechanical rename, not
   ad hoc generics.
3. **DataTable port**: `useReactTable` → `useTable({ features, ... })`,
   drop the per-model `get*RowModel()` options, keep every other option and
   the `state`/`on*Change` wiring. Keep default full-state subscription (no
   custom selector) — the component already re-renders on state change under
   v8 and this is the behavior-preserving choice.
4. **`createColumnHelper`**: becomes `createColumnHelper<typeof appFeatures, T>()`
   where used.

## Non-goals

- No table-state selector / `table.Subscribe` optimization (a separate perf
  change; would confound the signal).
- No new features enabled, no refactor of column definitions, no touching
  `CalendarManagementPage.tsx.backup` (not compiled).
- Not consolidating vitest configs; not fixing the baseline eslint problems
  or the stable `PersonalDashboardProgressCard` failure.

## Risks / invariants

- **Row selection type**: the probe showed `Updater<RowSelectionState>` vs
  `Record<string, boolean>` (v9 narrows selection values to `true`). Fix at
  the `DataTable` props boundary once, not per consumer, and confirm bulk
  select / select-all behavior in `DataTable.test.tsx`.
- **Behavioral drift is invisible to `tsc`.** Type-clean does not prove
  runtime parity (Phase 5 lesson). Verify by running the DataTable,
  ColumnVisibilityMenu, tableColumnHelpers and every consumer-page test, and
  by running the app and exercising sort / filter / paginate / select /
  hide-column on one real table.
- **Plugin removal safety**: plugin tables must import the alias from the
  core `components/ui` module only; no cross-plugin imports.
- Verification must use a **fresh `npm ci`** (Phase 4 lesson) and be
  interpreted against the documented vitest flakiness rules.

## Docs deliverables

- Phase 6 entry in `docs/superpowers/UPGRADE-JOURNAL.md` (what actually
  broke, exact commands, residual items).
- Update `CLAUDE.md` Hot Invariants with a concise react-table 9 bullet
  (use `AppColumnDef`; features live in one place; `sortFn` not `sortingFn`).
- Update `.devin/context/03-FRONTEND-PATTERNS.md` `DataTable` section if it
  shows v8 column typing (local-only, gitignored — edit in the main checkout,
  not committed).
