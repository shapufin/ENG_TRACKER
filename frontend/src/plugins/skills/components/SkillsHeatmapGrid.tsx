import React, { useMemo, useRef, useState } from "react";
import { levelHeat, levelLabel } from "../utils/proficiencyLevels";
import { groupSkillsByCategory } from "../utils/skillMatrixSelectors";
import { avgTone, categoryAccent } from "../utils/categoryAccents";
import { useSkillsGridActivation } from "../hooks/useSkillsGridActivation";
import { useSkillsColumnWidth } from "../hooks/useSkillsColumnWidth";
import { useSkillsGridVirtualizer } from "../hooks/useSkillsGridVirtualizer";
import type { SkillCoverage, TeamMatrixRow } from "../types/skills";
import type { SkillRateTarget } from "./SkillsMemberList";
import { SkillsMemberColumn, GRID_CELL_HEIGHT, GRID_HOVER_HIGHLIGHT } from "./SkillsMemberColumn";

const MEMBER_COL_WIDTH = 176;
const SKILL_COL_WIDTH = 64;
const MIN_SKILL_COL_WIDTH = 80;
const MAX_SKILL_COL_WIDTH = 180;
const CELL_HEIGHT = GRID_CELL_HEIGHT;
/** Highlight class for cells in the same row/col as the hovered cell. */
const HOVER_HIGHLIGHT = GRID_HOVER_HIGHLIGHT;

interface SkillsHeatmapGridProps {
  rows: TeamMatrixRow[];
  renderedCoverage: SkillCoverage[];
  totalGridRows: number;
  firstBodyRowIndex: number;
  focusedCell: { row: number; col: number };
  onFocusedCellChange: (cell: { row: number; col: number }) => void;
  onRate: (target: SkillRateTarget) => void;
}

/** Desktop virtualized heatmap — color-only swatch cells with column
 * virtualization via @tanstack/react-virtual. Headers and member column
 * are outside the virtualizer (siblings, not children) to preserve
 * position:sticky behavior. */
export const SkillsHeatmapGrid: React.FC<SkillsHeatmapGridProps> = ({
  rows,
  renderedCoverage,
  totalGridRows,
  firstBodyRowIndex,
  focusedCell,
  onFocusedCellChange,
  onRate,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);

  const categoryGroups = useMemo(() => groupSkillsByCategory(renderedCoverage), [renderedCoverage]);

  const skillColWidth = useSkillsColumnWidth({
    scrollRef,
    skillCount: renderedCoverage.length,
    memberColWidth: MEMBER_COL_WIDTH,
    minWidth: MIN_SKILL_COL_WIDTH,
    maxWidth: MAX_SKILL_COL_WIDTH,
    defaultWidth: SKILL_COL_WIDTH,
  });

  const virtualizer = useSkillsGridVirtualizer({
    scrollRef,
    skillCount: renderedCoverage.length,
    skillColWidth,
    memberColWidth: MEMBER_COL_WIDTH,
    focusedCell,
  });

  const { memberSkillMaps, handleCellKeyDown, effectiveFocusedCell } = useSkillsGridActivation({
    rows,
    renderedCoverage,
    focusedCell,
    onFocusedCellChange,
    onRate,
    scrollRef,
    scrollToIndex: virtualizer.scrollToIndex,
  });

  const totalWidth = MEMBER_COL_WIDTH + renderedCoverage.length * skillColWidth;
  const virtualItems = virtualizer.getVirtualItems();

  // Precompute the starting column index for each category group, so we
  // can check if a hovered column falls within a category for header
  // highlighting.
  const categoryGroupRanges = useMemo(
    () =>
      categoryGroups.map((group, index) => {
        const start = categoryGroups
          .slice(0, index)
          .reduce((sum, prev) => sum + prev.skills.length, 0);
        return { name: group.name, start, end: start + group.skills.length - 1 };
      }),
    [categoryGroups]
  );

  return (
    <div>
      <div
        ref={scrollRef}
        className="skills-scroll max-h-[calc(100vh-280px)] min-h-[300px] overflow-auto rounded-lg border border-border"
        aria-label="Skills heatmap — scroll horizontally to see more skills"
      >
        <div
          role="grid"
          aria-rowcount={totalGridRows}
          aria-colcount={renderedCoverage.length + 1}
          style={{ width: totalWidth, minWidth: "100%", position: "relative" }}
        >
          {/* Header strip — NOT virtualized. Sticky top. Contains all N skill
              headers as flex labels. Sibling of the body, not inside the
              virtualizer. */}
          <div className="sticky top-0 z-20 flex flex-col bg-muted shadow-sm backdrop-blur-sm">
            {/* Category super-header row */}
            <div className="flex">
              <div className="sticky left-0 z-30 flex h-6 w-44 shrink-0 items-center border-b border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                Member
              </div>
              <div className="flex" style={{ minWidth: `calc(100% - ${MEMBER_COL_WIDTH}px)` }}>
                {categoryGroupRanges.map((range) => {
                  const accent = categoryAccent(range.name);
                  const isHovered =
                    hoveredCol !== null && hoveredCol >= range.start && hoveredCol <= range.end;
                  return (
                    <div
                      key={range.name}
                      className={`flex h-6 shrink-0 items-center justify-center border-b border-l bg-muted px-1 py-1 text-center text-xs font-semibold transition-colors ${
                        isHovered ? "bg-foreground/5 dark:bg-foreground/10" : ""
                      } ${accent.text} ${accent.border}`}
                      style={{ width: (range.end - range.start + 1) * skillColWidth }}
                    >
                      {range.name}
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Skill sub-header row */}
            <div className="flex h-10">
              <div className="sticky left-0 z-30 flex h-10 w-44 shrink-0 items-center border-b border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground" />
              <div
                className="relative h-10 bg-muted"
                style={{
                  width: renderedCoverage.length * skillColWidth,
                  minWidth: `calc(100% - ${MEMBER_COL_WIDTH}px)`,
                }}
              >
                {virtualItems.map((virtualItem) => {
                  const c = renderedCoverage[virtualItem.index];
                  if (!c) return null;
                  const colIndex = virtualItem.index;
                  return (
                    <div
                      key={c.skill_id}
                      role="columnheader"
                      aria-colindex={colIndex + 2}
                      className={`absolute top-0 flex h-10 flex-col justify-center truncate border-b border-border bg-muted px-1 py-1 text-center text-xs font-medium transition-colors ${
                        hoveredCol === colIndex ? "bg-foreground/5 dark:bg-foreground/10" : ""
                      }`}
                      style={{ left: colIndex * skillColWidth, width: skillColWidth }}
                      title={c.skill_name}
                    >
                      <div className="truncate" title={c.skill_name}>
                        {c.skill_name}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Avg{" "}
                        <span className={`font-semibold ${avgTone(c.avg_level)}`}>
                          {c.avg_level}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Body area — member column (sticky left, NOT virtualized) +
              skill columns area (virtualized). Both are siblings. */}
          <div className="flex">
            <SkillsMemberColumn
              rows={rows}
              firstBodyRowIndex={firstBodyRowIndex}
              hoveredRow={hoveredRow}
              onHoverRow={setHoveredRow}
            />

            {/* Skill columns area — virtualized horizontally */}
            <div
              className="relative bg-card"
              style={{
                width: renderedCoverage.length * skillColWidth,
                minWidth: `calc(100% - ${MEMBER_COL_WIDTH}px)`,
              }}
            >
              {virtualItems.map((virtualItem) => {
                const colData = renderedCoverage[virtualItem.index];
                if (!colData) return null;
                const colHovered = hoveredCol === virtualItem.index;
                return (
                  <div
                    key={virtualItem.key}
                    className="absolute top-0 flex flex-col"
                    style={{
                      left: virtualItem.index * skillColWidth,
                      width: skillColWidth,
                    }}
                  >
                    {rows.map((row, rowIndex) => {
                      const skillData = memberSkillMaps[rowIndex]?.get(colData.skill_id);
                      const isFocused =
                        effectiveFocusedCell.row === rowIndex &&
                        effectiveFocusedCell.col === virtualItem.index;
                      const rowOrColHovered = hoveredRow === rowIndex || colHovered;
                      if (!skillData) {
                        return (
                          <div
                            key={row.user_id}
                            role="gridcell"
                            aria-rowindex={firstBodyRowIndex + rowIndex}
                            aria-colindex={virtualItem.index + 2}
                            className={`flex items-center justify-center border-t border-border/40 py-1.5 transition-colors ${CELL_HEIGHT} ${
                              rowOrColHovered ? HOVER_HIGHLIGHT : ""
                            }`}
                          >
                            <button
                              type="button"
                              data-row={rowIndex}
                              data-col={virtualItem.index}
                              tabIndex={isFocused ? 0 : -1}
                              onKeyDown={(e) => handleCellKeyDown(e, rowIndex, virtualItem.index)}
                              onClick={() =>
                                onFocusedCellChange({ row: rowIndex, col: virtualItem.index })
                              }
                              onMouseEnter={() => {
                                setHoveredRow(rowIndex);
                                setHoveredCol(virtualItem.index);
                              }}
                              onMouseLeave={() => {
                                setHoveredRow(null);
                                setHoveredCol(null);
                              }}
                              className={`inline-flex w-full items-center justify-center rounded-sm border border-dashed border-border/50 bg-muted/15 transition-colors hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${CELL_HEIGHT}`}
                              aria-label={`${row.username} ${colData.skill_name} — no rating`}
                              title={`${row.username} ${colData.skill_name}: no rating`}
                            />
                          </div>
                        );
                      }
                      const label = `${row.username} ${colData.skill_name} L${skillData.level}`;
                      return (
                        <div
                          key={row.user_id}
                          role="gridcell"
                          aria-rowindex={firstBodyRowIndex + rowIndex}
                          aria-colindex={virtualItem.index + 2}
                          className={`flex items-center justify-center border-t border-border/40 py-1.5 transition-colors ${CELL_HEIGHT} ${
                            rowOrColHovered ? HOVER_HIGHLIGHT : ""
                          }`}
                        >
                          <button
                            type="button"
                            data-row={rowIndex}
                            data-col={virtualItem.index}
                            tabIndex={isFocused ? 0 : -1}
                            onKeyDown={(e) => handleCellKeyDown(e, rowIndex, virtualItem.index)}
                            onClick={() => {
                              onFocusedCellChange({ row: rowIndex, col: virtualItem.index });
                              onRate({
                                userSkillId: skillData.user_skill_id,
                                username: row.username,
                                skillName: colData.skill_name,
                                currentLevel: skillData.level,
                              });
                            }}
                            onMouseEnter={() => {
                              setHoveredRow(rowIndex);
                              setHoveredCol(virtualItem.index);
                            }}
                            onMouseLeave={() => {
                              setHoveredRow(null);
                              setHoveredCol(null);
                            }}
                            className={`inline-flex w-full items-center justify-center rounded-sm border border-transparent transition-all hover:z-10 hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${CELL_HEIGHT} ${levelHeat(skillData.level)}`}
                            aria-label={label}
                            title={`${row.username} ${colData.skill_name}: L${skillData.level} — ${levelLabel(skillData.level)}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Legend lives in the shared SkillsLevelLegend on the page (all modes). */}
    </div>
  );
};
