/**
 * Single source of truth for table header and body surfaces.
 *
 * Every table — `DataTable` and the hand-rolled ones — must consume these. Do NOT
 * write header typography or a header fill inline in a `<thead>`: that is how this
 * codebase accumulated 4 tracking values, 3 font sizes and 5 band variants across
 * 21 files before `scripts/table-header-audit.mjs` existed.
 *
 * The header treatment is an explicit override of the `Time Tracker UI Project/`
 * mockups, which specify 12px/weight-600/muted-slate with an opaque #0C1019 band.
 * Recorded in DESIGN.md ("Table header contract") — read that note before
 * "restoring" the mockup values.
 */

/** Header row, non-sticky: transparent, separated by its bottom border only. */
export const TABLE_HEAD_ROW_CLASS = "border-border/70 border-b";

/**
 * Header cell. Left-aligned by default; an action column composes it with
 * `cn(TABLE_HEAD_CELL_CLASS, "text-right")` so tailwind-merge resolves the
 * text-align group. Never append the alignment in a template string — both
 * utilities would survive and CSS source order, not the class attribute, decides.
 */
export const TABLE_HEAD_CELL_CLASS =
  "text-foreground px-4 py-3 text-left font-medium whitespace-nowrap";

/**
 * Header cell for the selection checkbox: fixed width, no typography.
 * Never use `TABLE_HEAD_CELL_CLASS` here — its padding fights `w-10` and breaks
 * `DataTable.test.tsx`'s "select-all checks every row on the current page".
 */
export const TABLE_HEAD_CELL_CHECKBOX_CLASS = "w-10 px-4 py-3 text-left font-medium";

/** Body cell. */
export const TABLE_BODY_CELL_CLASS = "px-4 py-3 align-middle";

/** Body row hover. */
export const TABLE_ROW_HOVER_CLASS = "hover:bg-table-hover transition-colors";

/**
 * Header row of a div-grid "table" (no `<table>`, so no `<thead>`): same typography
 * and bottom border as `TABLE_HEAD_CELL_CLASS`. Compose it with the grid template:
 * `cn("grid grid-cols-[...]", TABLE_HEAD_GRID_CLASS)`.
 */
export const TABLE_HEAD_GRID_CLASS =
  "border-border/70 text-foreground gap-4 border-b px-6 py-3 text-sm font-medium";

/** Sticky right-hand actions column (DataTable column `id === "actions"`). */
export const TABLE_STICKY_ACTIONS_HEAD_CLASS =
  "sticky right-0 z-[1] bg-card shadow-[inset_1px_0_0_hsl(var(--line-subtle))]";

export const TABLE_STICKY_ACTIONS_CELL_CLASS =
  "sticky right-0 z-[1] bg-card shadow-[inset_1px_0_0_hsl(var(--line-subtle))] group-hover/row:bg-table-hover group-data-[state=selected]/row:bg-primary/10";
