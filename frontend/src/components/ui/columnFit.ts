import type { ColumnVisibilityState } from "@tanstack/react-table";

type ColumnPriority = 1 | 2 | 3;

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

const warnedWithoutId = new Set<string>();

/**
 * The column id the fit uses. A column with `meta.priority` must declare an
 * explicit `id`: TanStack derives ids from `accessorKey` (a nested `user.name`
 * does not keep its dots), so a guessed id could miss the visibility key. Without
 * one, dev builds warn once; an undotted `accessorKey` still works, a dotted one
 * leaves the column out of the fit (it is then never auto-hidden).
 */
export function resolveFitColumnId(column: {
  id?: string;
  meta?: { priority?: ColumnPriority };
}): string | undefined {
  if (column.id) return column.id;
  const accessorKey = (column as { accessorKey?: unknown }).accessorKey;
  const key = typeof accessorKey === "string" ? accessorKey : undefined;
  if (column.meta?.priority !== undefined && import.meta.env.DEV) {
    const label = key ?? "(unnamed)";
    if (!warnedWithoutId.has(label)) {
      warnedWithoutId.add(label);
      console.warn(`DataTable: column "${label}" sets meta.priority without an explicit id.`);
    }
  }
  return key && !key.includes(".") ? key : undefined;
}
