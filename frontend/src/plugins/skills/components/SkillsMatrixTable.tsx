import React, { useEffect, useMemo, useRef, useState } from "react";
import { levelColor } from "../utils/proficiencyLevels";
import { groupSkillsByCategory } from "../utils/skillMatrixSelectors";
import { avgTone, categoryAccent } from "../utils/categoryAccents";
import { useSkillsGridActivation } from "../hooks/useSkillsGridActivation";
import type { SkillCoverage, TeamMatrixRow } from "../types/skills";
import type { SkillRateTarget } from "./SkillsMemberList";
import { SkillsMemberCell } from "./SkillsMemberCell";

interface SkillsMatrixTableProps {
  rows: TeamMatrixRow[];
  renderedCoverage: SkillCoverage[];
  totalGridRows: number;
  firstBodyRowIndex: number;
  focusedCell: { row: number; col: number };
  onFocusedCellChange: (cell: { row: number; col: number }) => void;
  onRate: (target: SkillRateTarget) => void;
}

/** Desktop 2D sticky skills matrix with ARIA grid keyboard navigation,
 * crosshair hover, and per-category accent tinting. */
export const SkillsMatrixTable: React.FC<SkillsMatrixTableProps> = ({
  rows,
  renderedCoverage,
  totalGridRows,
  firstBodyRowIndex,
  focusedCell,
  onFocusedCellChange,
  onRate,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRowRef = useRef<HTMLTableRowElement>(null);
  const [headerHeight, setHeaderHeight] = useState(33);
  const [hovered, setHovered] = useState<{ row: number; col: number } | null>(null);

  const { memberSkillMaps, handleCellKeyDown, effectiveFocusedCell } = useSkillsGridActivation({
    rows,
    renderedCoverage,
    focusedCell,
    onFocusedCellChange,
    onRate,
    scrollRef,
  });

  // Group coverage by category for super-headers.
  const categoryGroups = useMemo(() => groupSkillsByCategory(renderedCoverage), [renderedCoverage]);

  useEffect(() => {
    const headerRow = headerRowRef.current;
    if (!headerRow || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const height = entry?.contentRect.height;
      if (height) setHeaderHeight(height);
    });
    observer.observe(headerRow);
    return () => observer.disconnect();
  }, [categoryGroups.length]);

  return (
    <div
      ref={scrollRef}
      className="skills-scroll max-h-[calc(100vh-280px)] min-h-[300px] overflow-auto rounded-lg border border-border"
      style={{ "--matrix-header-h": `${headerHeight}px` } as React.CSSProperties}
    >
      <table
        className="w-full text-sm"
        role="grid"
        aria-rowcount={totalGridRows}
        aria-label="Skills matrix — scroll horizontally to see more skills"
      >
        <thead className="bg-muted shadow-sm">
          {/* Category super-header row */}
          <tr ref={headerRowRef}>
            <th
              scope="col"
              className="sticky left-0 top-0 z-30 bg-muted px-3 py-2 text-left font-medium"
            >
              Member
            </th>
            {categoryGroups.map((group) => {
              const accent = categoryAccent(group.name);
              return (
                <th
                  key={group.name}
                  scope="colgroup"
                  colSpan={group.skills.length}
                  className={`sticky top-0 z-20 border-l bg-muted px-3 py-1 text-center text-xs font-semibold ${accent.text} ${accent.border}`}
                >
                  {group.name}
                </th>
              );
            })}
          </tr>
          {/* Skill sub-header row */}
          <tr>
            {/* Empty cell for the sticky "Member" column — keeps skill
                sub-headers aligned with body cells (column 2+, not 1). */}
            <th
              scope="col"
              aria-hidden="true"
              className="sticky left-0 top-[var(--matrix-header-h,33px)] z-20 bg-muted"
            />
            {renderedCoverage.map((c, colIndex) => (
              <th
                key={c.skill_id}
                scope="col"
                className={`sticky top-[var(--matrix-header-h,33px)] z-20 max-w-[90px] truncate whitespace-nowrap bg-muted px-2 py-1 text-center text-xs font-medium ${
                  hovered?.col === colIndex ? "bg-foreground/10" : ""
                }`}
                title={c.skill_name}
              >
                <div className="truncate" title={c.skill_name}>
                  {c.skill_name}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Avg{" "}
                  <span className={`font-mono font-semibold ${avgTone(c.avg_level)}`}>
                    {c.avg_level}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const skillMap = memberSkillMaps[rowIndex];
            return (
              <tr
                key={row.user_id}
                className={`border-t border-border ${
                  hovered?.row === rowIndex ? "bg-foreground/5" : ""
                }`}
                aria-rowindex={firstBodyRowIndex + rowIndex}
                onMouseEnter={() => setHovered({ row: rowIndex, col: hovered?.col ?? -1 })}
                onMouseLeave={() => setHovered(null)}
              >
                <td
                  className={`sticky left-0 z-10 whitespace-nowrap px-3 py-2 font-medium ${
                    hovered?.row === rowIndex ? "bg-foreground/5" : "bg-card"
                  }`}
                >
                  <SkillsMemberCell row={row} />
                </td>
                {renderedCoverage.map((c, colIndex) => {
                  const skillData = skillMap?.get(c.skill_id);
                  const isFocused =
                    effectiveFocusedCell.row === rowIndex && effectiveFocusedCell.col === colIndex;
                  if (!skillData) {
                    // Focusable placeholder so arrow-key nav can traverse
                    // unrated cells (WAI-ARIA grid pattern: all cells
                    // focusable). Enter does nothing — no rating to edit.
                    return (
                      <td key={c.skill_id} className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          data-row={rowIndex}
                          data-col={colIndex}
                          tabIndex={isFocused ? 0 : -1}
                          onKeyDown={(e) => handleCellKeyDown(e, rowIndex, colIndex)}
                          onClick={() => onFocusedCellChange({ row: rowIndex, col: colIndex })}
                          onMouseEnter={() => setHovered({ row: rowIndex, col: colIndex })}
                          className="inline-flex h-7 items-center justify-center rounded border border-transparent px-1.5 text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                          aria-label={`${row.username} ${c.skill_name} — no rating`}
                        >
                          <span
                            aria-hidden="true"
                            className="h-2.5 w-2.5 rounded-full border border-border/70 bg-transparent"
                          />
                        </button>
                      </td>
                    );
                  }
                  return (
                    <td key={c.skill_id} className="px-2 py-1.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          data-row={rowIndex}
                          data-col={colIndex}
                          tabIndex={isFocused ? 0 : -1}
                          onKeyDown={(e) => handleCellKeyDown(e, rowIndex, colIndex)}
                          onClick={() => {
                            onFocusedCellChange({ row: rowIndex, col: colIndex });
                            onRate({
                              userSkillId: skillData.user_skill_id,
                              username: row.username,
                              skillName: c.skill_name,
                              currentLevel: skillData.level,
                            });
                          }}
                          onMouseEnter={() => setHovered({ row: rowIndex, col: colIndex })}
                          className={`inline-flex h-7 items-center justify-center rounded border px-1.5 text-xs font-semibold transition-colors hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${levelColor(skillData.level)}`}
                          aria-label={`${row.username} ${c.skill_name} L${skillData.level}`}
                        >
                          L{skillData.level}
                        </button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
