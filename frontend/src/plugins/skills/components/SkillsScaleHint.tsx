import React, { useState } from "react";
import { X, LayoutGrid, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SkillsViewMode } from "../types/skills";

interface SkillsScaleHintProps {
  /** Number of skills currently visible in the matrix (renderedCoverage.length). */
  skillCount: number;
  viewMode: SkillsViewMode;
  /** Mobile gate lives INSIDE the component — mobile users see card lists,
   * not the desktop matrix, so the hint would recommend modes that don't
   * exist on mobile. */
  isMobile: boolean;
  /** Switch to Dense mode directly from the hint. */
  onSwitchToDense?: () => void;
  /** Switch to Heatmap mode directly from the hint. */
  onSwitchToHeatmap?: () => void;
}

/** Subtle, dismissible banner that recommends Dense or Heatmap mode when
 * the non-virtualized Matrix view is rendering 30+ skills. Dismissal is
 * component-local state only — it reappears on page reload (no localStorage
 * persistence). Threshold of 30 is the midpoint where native table layout
 * starts to degrade (50+ skills × 25 members = 1,250+ cells). */
export const SkillsScaleHint: React.FC<SkillsScaleHintProps> = ({
  skillCount,
  viewMode,
  isMobile,
  onSwitchToDense,
  onSwitchToHeatmap,
}) => {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || isMobile || skillCount <= 30 || viewMode !== "matrix") {
    return null;
  }

  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
    >
      <p>
        30+ skills visible — Dense or Heatmap mode performs better at this scale. Use the column
        selector to focus on specific skills.
      </p>
      <div className="flex items-center gap-2">
        {onSwitchToDense && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5"
            aria-label="Switch to Dense view"
            onClick={onSwitchToDense}
          >
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
            Dense
          </Button>
        )}
        {onSwitchToHeatmap && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5"
            aria-label="Switch to Heatmap view"
            onClick={onSwitchToHeatmap}
          >
            <Flame className="h-3.5 w-3.5" aria-hidden="true" />
            Heatmap
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          aria-label="Dismiss hint"
          onClick={() => setDismissed(true)}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
};
