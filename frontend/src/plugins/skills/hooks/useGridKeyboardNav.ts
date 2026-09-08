import { useMemo } from "react";

/** Options for the shared ARIA grid keyboard navigation hook. */
export interface UseGridKeyboardNavOptions {
  maxRow: number;
  maxCol: number;
  focusedCell: { row: number; col: number };
  onFocusedCellChange: (cell: { row: number; col: number }) => void;
  onActivate: (row: number, col: number) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** For virtualized grids: scroll to a column not in the DOM so the
   * async focus effect in the component can focus it after render. */
  scrollToIndex?: (index: number, options?: { align?: "start" | "center" | "end" }) => void;
}

/** Shared ARIA grid keyboard navigation — arrow keys move focus between
 * cells, Enter activates the current cell. Extracted from
 * `SkillsMatrixTable` so both Matrix and Heatmap modes share identical
 * keyboard behavior. */
export function useGridKeyboardNav(opts: UseGridKeyboardNavOptions) {
  const { maxRow, maxCol, focusedCell, onFocusedCellChange, onActivate, scrollRef, scrollToIndex } =
    opts;

  const effectiveFocusedCell = useMemo(
    () => ({
      row: maxRow > 0 ? Math.min(focusedCell.row, maxRow) : 0,
      col: maxCol > 0 ? Math.min(focusedCell.col, maxCol) : 0,
    }),
    [maxRow, maxCol, focusedCell.row, focusedCell.col]
  );

  const handleCellKeyDown = (e: React.KeyboardEvent, row: number, col: number) => {
    let nextRow = row;
    let nextCol = col;

    switch (e.key) {
      case "ArrowDown":
        if (row >= maxRow) return;
        nextRow = row + 1;
        break;
      case "ArrowUp":
        if (row <= 0) return;
        nextRow = row - 1;
        break;
      case "ArrowRight":
        if (col >= maxCol) return;
        nextCol = col + 1;
        break;
      case "ArrowLeft":
        if (col <= 0) return;
        nextCol = col - 1;
        break;
      case "Enter":
        e.preventDefault();
        onActivate(row, col);
        return;
      default:
        return;
    }

    e.preventDefault();
    onFocusedCellChange({ row: nextRow, col: nextCol });
    const nextEl = scrollRef.current?.querySelector(
      `[data-row="${nextRow}"][data-col="${nextCol}"]`
    ) as HTMLElement | null;
    if (nextEl) {
      nextEl.focus();
    } else if (scrollToIndex) {
      scrollToIndex(nextCol, { align: "center" });
    }
  };

  return { handleCellKeyDown, effectiveFocusedCell };
}
