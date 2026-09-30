# Phase 6 — react-table 9 Upgrade (Plan)

Design: `docs/superpowers/specs/2026-09-30-react-table-upgrade-design.md`
Branch: `upgrade/react-table` (worktree `.worktrees/upgrade-react-table`)
All commands run from `frontend/` unless stated.

## Global constraints

- Bump only `@tanstack/react-table` to `^9.2.4`. No collateral upgrades.
- Never push. Commit on the branch only.
- Do not fix baseline eslint problems (4) or the stable failing test.
- Do not reformat `package.json`. Keep the Phase 4 tsc guard passing.
- Targeted tests while iterating; the full pass once, in Task 4.
- Use the `AppColumnDef` family; never inline `ColumnDef<typeof appFeatures, …>`
  in a consumer.

## Task 1 — Bump + core (DataTable, features, aliases)

1. `npm i @tanstack/react-table@^9.2.4` (updates package.json + lockfile).
2. In `src/components/ui/DataTable.tsx`: define module-scope `appFeatures`
   via `tableFeatures` with only the used features/row models/fns; export it.
   Replace `useReactTable` + `get*RowModel()` with `useTable({ features, … })`.
   Fix the `RowSelectionState` boundary once (see spec risk).
3. In `src/components/ui/tableColumnHelpers.tsx`: export `AppColumnDef` and
   the other `App*` aliases; migrate its own `createColumnHelper`/generics.
4. Migrate `ColumnVisibilityMenu.tsx` and the three core test files
   (`DataTable.test.tsx`, `ColumnVisibilityMenu.test.tsx`,
   `tableColumnHelpers.test.tsx`).
5. Verify: `npx vitest run src/components/ui/DataTable.test.tsx
   src/components/ui/ColumnVisibilityMenu.test.tsx
   src/components/ui/tableColumnHelpers.test.tsx` passes; `tsc -b` errors
   are now only in consumer files.
6. Commit: `feat: port DataTable to react-table 9 with shared appFeatures`.

## Task 2 — Consumer migration (mechanical)

Migrate every remaining file from `tsc -b` output (~35 files: pages/*/hooks/*Columns,
admin tables, payroll, ticket_kpi, data_import, control_room, dashboard,
team, hr, hours_logs). Replace `ColumnDef<X>` → `AppColumnDef<X>` (and
`Row`/`Column`/`Cell`/`CellContext`/`Table` likewise), rename any
`sortingFn` → `sortFn`. Change types only — no logic edits. Loop:
`npx tsc -b`, fix, repeat until exit 0. Commit in 2-3 logical groups.

## Task 3 — Behavior verification (not just types)

Run tests for every touched consumer directory; then start the dev server and,
on one real table (e.g. Leave requests or Users admin), exercise sort, global
filter, pagination, select-all, per-row select, hide column. Record what was
observed.

## Task 4 — Full verification from fresh install

`rm -rf node_modules && npm ci`, then: `npx tsc -b`; `npx eslint src`
(expect 4 problems / 2 errors / 2 warnings); `npx vitest run --config
vite.config.ts` and `npx vitest run --config vitest.config.ts` (each expect
2475 passed / 1 failed / 2476; re-run idle before trusting any deviation);
`npm run build`. Confirm installed version from
`node_modules/@tanstack/react-table/package.json`.

## Task 5 — Docs

Add the Phase 6 entry to `docs/superpowers/UPGRADE-JOURNAL.md`; add the
`CLAUDE.md` Hot Invariants bullet; update `.devin/context/03-FRONTEND-PATTERNS.md`
(main checkout, uncommitted/local) if it shows v8 typing. Commit docs.

## Task 6 — Final review + merge

One whole-branch review of the diff. Then merge `--no-ff` into main,
re-verify on main (Task 4 commands), push, remove worktree and branch.
