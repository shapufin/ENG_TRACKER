/** Sticky member column shared by the virtualized grids (Dense + Heatmap).
 *
 * Extracted from SkillsDenseMatrix/SkillsHeatmapGrid (fallow dup:704b50b5).
 * Renders all M rows (M ≤ 25) outside the virtualizer — position:sticky
 * breaks inside transformed/absolute virtual items (TanStack #640).
 */
import React from "react";
import { SkillsMemberCell } from "./SkillsMemberCell";
import type { TeamMatrixRow } from "../types/skills";

/** Row height shared with the skill-cell rows of both grids. */
export const GRID_CELL_HEIGHT = "h-7";
/** Crosshair highlight for cells in the hovered row/column. */
export const GRID_HOVER_HIGHLIGHT =
  "bg-foreground/5 dark:bg-foreground/10 transition-colors duration-100";

interface SkillsMemberColumnProps {
  rows: TeamMatrixRow[];
  firstBodyRowIndex: number;
  hoveredRow: number | null;
  onHoverRow: (rowIndex: number | null) => void;
}

export const SkillsMemberColumn: React.FC<SkillsMemberColumnProps> = ({
  rows,
  firstBodyRowIndex,
  hoveredRow,
  onHoverRow,
}) => (
  <div className="sticky left-0 z-10 w-44 shrink-0 bg-card">
    {rows.map((row, rowIndex) => (
      <div
        key={row.user_id}
        role="row"
        aria-rowindex={firstBodyRowIndex + rowIndex}
        onMouseEnter={() => onHoverRow(rowIndex)}
        onMouseLeave={() => onHoverRow(null)}
        className={`flex items-center border-t border-border/40 px-3 py-1.5 ${GRID_CELL_HEIGHT} ${
          hoveredRow === rowIndex ? GRID_HOVER_HIGHLIGHT : ""
        }`}
      >
        <div role="rowheader" aria-colindex={1} className="min-w-0 flex-1">
          <SkillsMemberCell row={row} compact />
        </div>
      </div>
    ))}
  </div>
);
