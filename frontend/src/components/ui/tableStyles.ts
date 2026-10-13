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
export const TABLE_BODY_CELL_CLASS = "px-4 py-2 align-middle";

/** Body row hover. */
export const TABLE_ROW_HOVER_CLASS = "hover:bg-table-hover transition-colors";

/**
 * Row separators for a hand-rolled `<tbody>`: the same `divide-y` rule `DataTable`
 * uses. Put it on the `<tbody>` and drop any `border-b` / `last:border-0` on the `<tr>`
 * — both together draw a double line.
 */
export const TABLE_BODY_DIVIDER_CLASS = "divide-border/50 divide-y";

/**
 * Header row of a div-grid "table" (no `<table>`, so no `<thead>`): same typography
 * and bottom border as `TABLE_HEAD_CELL_CLASS`. Compose it with the grid template:
 * `cn("grid grid-cols-[...]", TABLE_HEAD_GRID_CLASS)`.
 */
export const TABLE_HEAD_GRID_CLASS =
  "border-border/70 text-foreground gap-4 border-b px-6 py-3 text-sm font-medium";

/**
 * Actions column (DataTable column `id === "actions"`): right-aligned and sized
 * by its icons — the AdminGUI mockup treatment.
 *
 * Deliberately NOT a sticky opaque panel. The lift's original version pinned the
 * column with `sticky right-0 bg-card shadow-[inset_1px_0_0_…]`, which read as a
 * permanent white block at the right edge of every row and reserved ~120px of
 * width; it was replaced in the 2026-10-10 refinement because the panel cost
 * more space than the icons it carried. Row actions stay hover/focus/selection
 * revealed (`RowActions`), so an idle row shows nothing there at all.
 *
 * Compose, never replace: `cn(TABLE_HEAD_CELL_CLASS, TABLE_ACTIONS_HEAD_CLASS)`
 * for the header, `cn(TABLE_BODY_CELL_CLASS, TABLE_ACTIONS_CELL_CLASS)` for the
 * cells. The alignment and the tight `px-2` live in the constant so
 * tailwind-merge resolves the `text-left`/`text-right` and `px-*` groups instead
 * of both utilities surviving (the column is icon-width, so it needs none of the
 * generous gutter a text column gets).
 */
export const TABLE_ACTIONS_HEAD_CLASS = "px-2 text-right";

export const TABLE_ACTIONS_CELL_CLASS = "px-2 text-right";
