/** Shared responsive skill-column width for the virtualized grids.
 *
 * Extracted from SkillsDenseMatrix/SkillsHeatmapGrid (fallow dup:1aa2428d).
 * Measures the scroll viewport and derives the per-skill column width.
 * NOTE: the TanStack `virtualizer.measure()` invalidation effect stays in
 * each component (it needs the virtualizer instance) — see the v2 spec §0.2.7
 * for the invariants this hook must not violate.
 */
import { useEffect, useState } from "react";
import type { RefObject } from "react";

interface UseSkillsColumnWidthOptions {
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Number of visible skills — 0 disables measurement. */
  skillCount: number;
  /** Sticky member-column width subtracted from the viewport. */
  memberColWidth: number;
  minWidth: number;
  maxWidth: number;
  /** Initial estimate before the first measurement. */
  defaultWidth: number;
}

export const useSkillsColumnWidth = ({
  scrollRef,
  skillCount,
  memberColWidth,
  minWidth,
  maxWidth,
  defaultWidth,
}: UseSkillsColumnWidthOptions): number => {
  const [skillColWidth, setSkillColWidth] = useState(defaultWidth);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement || skillCount === 0 || typeof ResizeObserver === "undefined") {
      return;
    }
    const updateColumnWidth = () => {
      const availableSkillWidth = scrollElement.clientWidth - memberColWidth;
      const desired = availableSkillWidth / skillCount;
      setSkillColWidth(Math.max(minWidth, Math.min(maxWidth, desired)));
    };
    updateColumnWidth();
    const observer = new ResizeObserver(updateColumnWidth);
    observer.observe(scrollElement);
    return () => observer.disconnect();
  }, [scrollRef, skillCount, memberColWidth, minWidth, maxWidth]);

  return skillColWidth;
};
