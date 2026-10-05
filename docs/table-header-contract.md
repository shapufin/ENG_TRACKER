# Table Header Contract

Tracked handoff doc for the table-header centralization work (2026-10-05).
`DESIGN.md` holds the design decision; this file holds the engineering state —
the rule, the gate, the migration recipe, and what is still outstanding.

Read this before touching any table, and before "restoring" anything that looks
like a mockup value.

## 1. The rule

Single source of truth: `frontend/src/components/ui/tableStyles.ts`.

**No `<thead>` may declare header typography or a header fill inline.** Every table
— `DataTable` and the hand-rolled ones — imports the constants. This is what stops
4 tracking values, 3 font sizes and 5 band variants re-accumulating.

| Constant | Use |
|---|---|
| `TABLE_HEAD_ROW_CLASS` | header row: transparent, separated by its bottom border only |
| `TABLE_HEAD_CELL_CLASS` | header cell: `text-foreground px-4 py-3 text-left font-medium whitespace-nowrap` |
| `TABLE_HEAD_CELL_CHECKBOX_CLASS` | the selection cell: `w-10 px-4 py-3 text-left font-medium` (weight set so the cell does not fall back to the UA bold default) |
| `TABLE_HEAD_GRID_CLASS` | header row of a div-grid table (compose with the grid template) |
| `TABLE_BODY_CELL_CLASS` | body cell: `px-4 py-3 align-middle` |
| `TABLE_ROW_HOVER_CLASS` | body row hover: `hover:bg-table-hover transition-colors` |

### This is an explicit override of the mockups

The `Time Tracker UI Project/{Admin,Employee,TL}/assets/tokens.css` mockups specify
`thead th { padding:.75rem 1rem; color:#94A3B8; font-weight:600; background:#0C1019;
white-space:nowrap }` — 12px, muted slate, an **opaque band**, no uppercase.

A user decision on 2026-10-05 chose the **shadcn treatment** instead (normal-case,
body size, `text-foreground`, transparent header). `DESIGN.md` → "Table header
contract" records it. **Do not revert to the mockup values**; that note is the only
reason the override survives.

## 2. The gate

```bash
cd frontend
node --test scripts/table-header-audit.test.mjs   # the detector's own tests (24)
node scripts/table-header-audit.mjs; echo $?      # the repo scan
```

Both run in CI (`Table header contract` step). Exit 1 lists `file:line  RULE  text`.
Detection lives in `scripts/table-header-audit-lib.mjs`; the scan covers tracked **and
untracked** `src/**/*.{ts,tsx,js,jsx}` (non-test).

| Rule | Fires on |
|---|---|
| `INLINE-HEADER` | inside any `<thead>` / `<TableHeader>` block: `uppercase`, `capitalize`, any `tracking-*`, `text-xs/sm/base/lg`, `text-[Npx]`, `font-light/normal/medium/semibold/bold`, `text-foreground/muted-foreground/muted`, `bg-muted/card/secondary/accent/background` |
| `OPAQUE-CLASS` | `className={ident}` inside a header block, unless the same file defines `const ident = [cn(]TABLE_�` |
| `GRID-HEADER` | a line with `grid-cols` plus `uppercase` or `tracking-*` (a div-grid "table" has no `<thead>`) |

The scan is **text-based on purpose**. The earlier tag-level regex was truncated by the
`>` in variants such as `[&>span]:uppercase`, and listed only `tracking-wider|widest`, so
`tracking-wide`, class strings in a variable, shadcn `TableHead`, and div-grid headers
all slipped through (found in the 2026-10-05 review). Each evasion is now a test case.

Allowlisted (documented, sticky/virtualised grids that keep an opaque fill and compact
type � `DESIGN.md` "Known intentional token exceptions"):
`components/calendar/ListView.tsx`, `plugins/skills/components/SkillsMatrixTable.tsx`,
`SkillsDenseMatrix.tsx`, `SkillsHeatmapGrid.tsx` (the last two use `role="columnheader"`).

Div-grid headers use `TABLE_HEAD_GRID_CLASS`: `cn("grid grid-cols-[�]", TABLE_HEAD_GRID_CLASS)`
(`TeamsTableHeader.tsx`).

**Status: PASS, 0 violations; 24/24 detector tests.** If you change a pattern, add the
evasion as a test first.

## 3. Queue — COMPLETE (0 violations)

Every file that carried inline header typography or a header fill has been
converged. **All `<thead>`-bearing files are now compliant.** Column counts are
re-derivable with `grep -c '<th ' <file>` (trailing space) — a bare `grep -c '<th'`
also counts `<thead`.

| File | Was | How |
|---|---|---|
| `components/ui/DataTable.tsx` | 3 | the lever — consumes the contract |
| `plugins/tl_scorecard/components/hbpr/AssignedLeadersTable.tsx` | 8 | contract, composes `px-3` |
| `plugins/engagement/components/TeamBreakdownTable.tsx` | 9 | **migrated onto `DataTable`** — 8 column defs, custom card header kept, no `searchColumn` |
| `plugins/tl_scorecard/components/hbpr/HbprRecordExplorer.tsx` | 7 | contract, composes `py-2` |
| `pages/admin/ResourceAccessPage.tsx` | 6 | contract; its select-all cell uses `cn(TABLE_HEAD_CELL_CHECKBOX_CLASS, "w-12")` |
| `plugins/tl_scorecard/components/records/RecordListPanel.tsx` | 6 | contract, composes `py-2`; `max-md:sr-only` kept on the `<thead>` |
| `plugins/skills/components/SkillsCatalogWorkspace.tsx` | 4 | contract, composes `px-3` |
| `pages/admin/components/ResourceAccessMemberList.tsx` | 4 | contract, bare |
| `pages/settings/components/ClientAssignmentSection.tsx` | 3 | contract, composes `px-0 py-0 pb-2 pr-2` |
| `plugins/ticket_kpi/components/MemberTicketRecordsTable.tsx` | 2 | contract, bare |
| `pages/hr/components/HRTableShell.tsx` | 1 | contract, bare |
| `pages/admin/components/HolidayTable.tsx` | 1 | **migrated onto `DataTable`** (pilot) |
| `pages/admin/components/ReportUserTable.tsx` | 1 | contract, composes `px-6 py-4` |
| `plugins/payroll/components/PayrollRunLinesTable.tsx` | 1 | row class only |
| `plugins/site_backup/components/RestorePreviewTable.tsx` | 1 | row class only |
| `plugins/site_backup/pages/BackupRestorePage.tsx` | 1 | row class only |
| `plugins/ticket_kpi/components/TestMappingResult.tsx` | 1 | contract, composes `px-2 py-1` |
| `plugins/ticket_kpi/components/UploadPreviewPanel.tsx` | 1 | contract, composes `px-3 py-2` |
| `pages/standby/components/WeeklyGeneratorDialog.tsx` | 1 | contract, composes `px-3 py-1`; pinned test rewritten |

Migrated so far (2 of the hand-rolled tables): `HolidayTable` (5 cols) and
`TeamBreakdownTable` (8 cols). Both prove the recipe in §4.

Not yet migrated (deliberate — they have custom cells, a mobile card mode, or a
feature `DataTable` cannot express): `AssignedLeadersTable`, `RecordListPanel`,
`SkillsCatalogWorkspace`, `HbprRecordExplorer`, `ResourceAccessPage`,
`ResourceAccessMemberList`, `ReportUserTable`, `PayrollRunLinesTable`, the two
site_backup tables, `TestMappingResult`, `UploadPreviewPanel`,
`ClientAssignmentSection`, `WeeklyGeneratorDialog`, `MemberTicketRecordsTable`
(dynamic columns + its own server-side pagination).

**Migrating those is a separate, still-open de-bloating task.** It would delete
their `<thead>`/`<tbody>` markup and column-width logic, but each needs column
defs, a test and a browser check — and several need a card mode that `DataTable`
does not have (see §6). The header contract does not depend on it. Ordering advice:
smallest first (`ReportUserTable` 88 lines, `PayrollRunLinesTable` 125,
`TeamBreakdownTable`-style); note only 2 of the remaining files have a test today
(`ResourceAccessPage`, `MemberTicketRecordsTable`), so the rest need a test written
as part of the migration.

## 4. Migration recipe

**Converge in place** (the table has custom cells / a mobile card mode that
`DataTable` cannot express):

1. Import `TABLE_HEAD_ROW_CLASS`, `TABLE_HEAD_CELL_CLASS` and `cn` from
   `@/lib/utils` (most of these files do not import `cn` yet — check).
2. Put `TABLE_HEAD_ROW_CLASS` on the header `<tr>` (not the `<thead>`) when the
   `<thead>` carries a non-visual class such as `max-md:sr-only`.
3. Replace each `<th>`'s typography with the constant. **Compose** any
   table-specific padding: `cn(TABLE_HEAD_CELL_CLASS, "py-2")`. `cn` is
   tailwind-merge, so the later padding wins — but only for the padding group.
4. Never append an *alignment* in a template string. `text-left` and `text-right`
   are the same merge group; in a template string both survive and CSS source order
   decides. Use `cn(TABLE_HEAD_CELL_CLASS, "text-right")`.

**Migrate onto `DataTable`** (array-driven rows, ≥3 columns, in a card or page):

1. Build `useMemo<AppColumnDef<Row>[]>(...)` from `@/components/ui/tableTypes`.
2. Reuse `createEditDeleteActionsColumn` / `createCrudActionsColumn` /
   `createViewApproveRejectActionsColumn` from `@/components/ui/tableColumnHelpers`
   for action columns — they already carry accessible labels.
3. **Omit `searchColumn`** unless you intend to *add* a search box. `DataTable`
   renders its toolbar only when `searchPaths.length > 0 || enableColumnVisibility`.
   A migration must be behavior-preserving.
4. Drop the table's own `overflow-x-auto` wrapper (`DataTable` owns the single
   scroll viewport) and use the documented wrapper:
   `<GlassCard className="p-4"><DataTable … /></GlassCard>`.
5. Tests that render a real `DataTable` need the jsdom stub:
   ```ts
   vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
   ```

**Migrating a table also breaks the CONSUMING page's test.** `DataTable` mounts a
`ResizeObserver`, which jsdom lacks, so a page test that previously rendered a plain
`<table>` now throws `ReferenceError: ResizeObserver is not defined`. This has
happened twice: `HolidayTable.modernization.test.tsx` and
`EngagementMetricsPage.test.tsx` (via `TeamBreakdownTable`). Add the stub above; the
assertions themselves are unchanged. Grep for the component's consumers before you
migrate, and add the stub to each page test in the same diff.

## 5. Traps a checker must not "fix"

1. **The selection checkbox cell must use `TABLE_HEAD_CELL_CHECKBOX_CLASS`**, never
   `TABLE_HEAD_CELL_CLASS`. The latter's padding fights `w-10` and breaks
   `DataTable.test.tsx`'s `select-all checks every row on the current page`.
2. **`DataTable`'s header is intentionally transparent.** It has no `sticky` and no
   vertical scroll, so nothing can pass beneath it. `bg-muted/90` on it is a bug.
   Sticky headers (skills grids, calendar list) legitimately keep an opaque fill.
3. **`DataTable.test.tsx`'s band test** now asserts `not.toContain("bg-muted/90")`.
   That is the current, intended state — not a broken test.
4. **`HolidayTable.modernization.test.tsx`** stubs `ResizeObserver` because
   `HolidayTable` now renders a `DataTable`. Assertions unchanged.
5. **`WeeklyGeneratorDialog.test.tsx`** asserts the contract (`border-b`, and NOT
   the band). Its old assertion pinned the mockup's opaque band and was rewritten
   deliberately.
6. **Table padding is composed per table on purpose.** Dense lists, inline form
   tables and preview grids keep their own padding via `cn`. That is not drift —
   the *typography* and *fill* are what the contract owns.

## 6. Known gaps (verified, not assumed)

- **`DataTable` has no mobile card mode.** `03-FRONTEND-PATTERNS.md`'s "three-mode
  responsive table" describes an intent that was never implemented; the viewport is
  `overflow-x-auto` only. Tables needing a mobile card treatment implement it
  themselves (`AssignedLeadersTable`'s `md:hidden` list, `RecordListPanel`'s
  `max-md:sr-only`), which is why they are not migrated.
- **`/admin/backup-restore` renders no table on its default tab**, so
  `BackupRestorePage` / `RestorePreviewTable` are covered by tests only — no
  screenshot evidence.
- **The mocked `HolidayTable` grid is not screenshot-verified** — the e2e database
  has no holidays, so that tab renders the empty state. Covered by 4 unit tests.
- **The working tree carries several uncommitted workstreams** (a round-1 mockup
  refactor, an EPR stage-evidence feature, and this table work). Do not attribute
  every modified file to this contract.

## 7. Check commands

```bash
cd frontend
node scripts/table-header-audit.mjs            # expect PASS: 0 violations
npx prettier --check src/components/ui/tableStyles.ts src/components/ui/DataTable.tsx
npx vitest run src/components/ui/DataTable.test.tsx   # 20 tests
npx tsc -b
npx vitest run                                 # 456 files / 2755 tests
npm run build
```

Visual check: `frontend/scripts/shot-tables.mjs` (app captures, 320+1280 ×
light/dark) and `frontend/scripts/shot-refs.mjs` (shadcn references). Rendered
mockup captures live in `design-screenshots/tables-plan/mocks/`.

## 8. Change log

- **2026-10-05** — contract created; `DataTable` + `AssignedLeadersTable` +
  `HRTableShell` converged; `HolidayTable` migrated (pilot); audit tightened
  (bare-`bg-muted` hole); 47 → 34 violations.
- **2026-10-05 (later)** — remaining 8 files converged; **audit PASS: 0
  violations**. Full suite green, `tsc -b` / eslint / prettier / build clean.
  Browser-verified: `/settings`, `/tl-scorecard?tab=records`,
  `/admin/resource-access` (select-all checkbox intact in its `w-12` cell),
  `/admin/skills/catalog` — all headers read `14px / weight 500 /
  text-transform: none / transparent`. Captures in
  `design-screenshots/tables-plan/{phaseA,phaseB}/`.
- **2026-10-05 (de-bloating start)** — `TeamBreakdownTable` migrated onto
  `DataTable` (8 column defs, custom card header kept, `searchColumn` omitted so no
  search box is added). Its page test needed the `ResizeObserver` stub — see §5.
  Audit file count 20 → 19. Full suite **456 files / 2755 tests**; `tsc -b` /
  eslint / prettier / build clean. Browser-verified at `/engagement/metrics`: 8
  columns, 1 row, sortable headers, result count, transparent header
  (`design-screenshots/tables-plan/engagement/`).
- **2026-10-05 (review pass)** � independent review found the gate could be evaded and one
  real violation it could not see. Fixed: audit rewritten as a text-based detector with 24
  tests and wired into CI; `TeamsTableHeader` (div-grid, was `uppercase tracking-[0.2em]`)
  moved onto `TABLE_HEAD_GRID_CLASS`; skills-catalog select cell and the checkbox constant
  now set a weight. Browser sweep (`shot-review`, 20 pages � light/dark � 1280/320): every
  `thead th` is 14px / 500 / no transform / no tracking, no page-level horizontal overflow.
