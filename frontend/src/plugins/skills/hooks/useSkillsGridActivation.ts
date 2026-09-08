import { useCallback, useMemo } from "react";
import { getMemberSkillMap } from "../utils/skillMatrixSelectors";
import { useGridKeyboardNav } from "./useGridKeyboardNav";
import type { SkillCoverage, TeamMatrixRow } from "../types/skills";
import type { SkillRateTarget } from "../components/SkillsMemberList";

interface UseSkillsGridActivationOptions {
  rows: TeamMatrixRow[];
  renderedCoverage: SkillCoverage[];
  focusedCell: { row: number; col: number };
  onFocusedCellChange: (cell: { row: number; col: number }) => void;
  onRate: (target: SkillRateTarget) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Virtualized components pass `virtualizer.scrollToIndex`; the native
   * table omits it (no virtualizer). */
  scrollToIndex?: (index: number, options?: { align?: "start" | "center" | "end" }) => void;
}

/** Shared activation + keyboard navigation logic for all three Skills grid
 * views (Matrix, Dense, Heatmap). Returns the memoized `memberSkillMaps`
 * (used by both `handleActivate` and cell rendering), plus the keyboard
 * handler and effective focused cell from `useGridKeyboardNav`.
 *
 * Extracted 2026-08-28 to eliminate the 27-line clone group `dup:d4314918`
 * flagged by fallow across `SkillsDenseMatrix`, `SkillsHeatmapGrid`, and
 * `SkillsMatrixTable`. */
export function useSkillsGridActivation({
  rows,
  renderedCoverage,
  focusedCell,
  onFocusedCellChange,
  onRate,
  scrollRef,
  scrollToIndex,
}: UseSkillsGridActivationOptions) {
  const memberSkillMaps = useMemo(() => rows.map(getMemberSkillMap), [rows]);

  const handleActivate = useCallback(
    (row: number, col: number) => {
      const rowData = rows[row];
      const colData = renderedCoverage[col];
      if (!rowData || !colData) return;
      const skillData = memberSkillMaps[row]?.get(colData.skill_id);
      if (skillData) {
        onRate({
          userSkillId: skillData.user_skill_id,
          username: rowData.username,
          skillName: colData.skill_name,
          currentLevel: skillData.level,
        });
      }
    },
    [memberSkillMaps, onRate, renderedCoverage, rows]
  );

  const { handleCellKeyDown, effectiveFocusedCell } = useGridKeyboardNav({
    maxRow: rows.length - 1,
    maxCol: renderedCoverage.length - 1,
    focusedCell,
    onFocusedCellChange,
    onActivate: handleActivate,
    scrollRef,
    scrollToIndex,
  });

  return { memberSkillMaps, handleCellKeyDown, effectiveFocusedCell };
}
