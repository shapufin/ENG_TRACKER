import type { ColumnVisibilityState } from "@tanstack/react-table";

export type ColumnPriority = 1 | 2 | 3;

export interface FitColumn {
  id: string;
  size: number;
  priority: ColumnPriority;
}

/**
 * Which columns fit `availableWidth`: priority 3 columns are hidden first, right
 * to left, then priority 2, until the sum of `size` fits. Priority 1 is never
 * hidden, so a table whose priority-1 columns alone overflow still scrolls.
 */
export function computeAutoVisibility(
  columns: FitColumn[],
  availableWidth: number
): ColumnVisibilityState {
  const visibility: ColumnVisibilityState = Object.fromEntries(columns.map((c) => [c.id, true]));
  let total = columns.reduce((sum, c) => sum + c.size, 0);
  for (const priority of [3, 2] as const) {
    for (let i = columns.length - 1; i >= 0 && total > availableWidth; i--) {
      const column = columns[i];
      if (column.priority !== priority) continue;
      visibility[column.id] = false;
      total -= column.size;
    }
  }
  return visibility;
}
