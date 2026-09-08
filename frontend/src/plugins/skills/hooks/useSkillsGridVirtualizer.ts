/** Shared TanStack Virtual setup for the horizontal skill grids.
 *
 * Extracted from SkillsDenseMatrix/SkillsHeatmapGrid (fallow dup:a7bb0868).
 * Owns the three invariants that previously caused the 2026-08-28 column
 * overlap regression, so they are enforced in ONE place:
 *   1. `measure()` invalidates the cached item sizes whenever the responsive
 *      column width changes (TanStack keeps the initial estimate otherwise).
 *   2. Async focus: after scrollToIndex re-renders, focus the now-rendered
 *      cell (TanStack #158).
 *   3. Scroll clamp when columns are removed.
 * Column POSITIONING (`left: index * skillColWidth`, never
 * `virtualItem.start`) stays at the render site — it is JSX, not setup.
 */
import { useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { RefObject } from "react";

interface UseSkillsGridVirtualizerOptions {
  scrollRef: RefObject<HTMLDivElement | null>;
  skillCount: number;
  skillColWidth: number;
  memberColWidth: number;
  focusedCell: { row: number; col: number };
}

export const useSkillsGridVirtualizer = ({
  scrollRef,
  skillCount,
  skillColWidth,
  memberColWidth,
  focusedCell,
}: UseSkillsGridVirtualizerOptions) => {
  const virtualizer = useVirtualizer({
    count: skillCount,
    getScrollElement: () => scrollRef.current,
    horizontal: true,
    overscan: 4,
    estimateSize: () => skillColWidth,
    scrollMargin: memberColWidth,
  });

  // Invalidate the virtualizer's cached item sizes whenever the responsive
  // column width changes. Without this, TanStack Virtual keeps the initial
  // estimate and positions columns at stale offsets, causing overlap.
  useEffect(() => {
    virtualizer.measure();
  }, [skillColWidth, virtualizer]);

  // Async focus: after the virtualizer re-renders (scrollToIndex brings a
  // virtualized-out column into view), focus the now-rendered cell.
  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current.querySelector(
      `[data-row="${focusedCell.row}"][data-col="${focusedCell.col}"]`
    ) as HTMLElement | null;
    el?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedCell, virtualizer.getVirtualItems()]);

  // Scroll clamp: if columns are removed and scrollLeft exceeds the new
  // total width, clamp it back.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (el.scrollLeft > maxScroll) el.scrollLeft = Math.max(0, maxScroll);
  }, [skillCount]);

  return virtualizer;
};
