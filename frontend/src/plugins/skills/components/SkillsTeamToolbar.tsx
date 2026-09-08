import React from "react";
import { Filter, Flame, Grid2X2, LayoutGrid, List, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/GlassCard";
import { SkillsColumnSelector } from "./SkillsColumnSelector";
import type { SkillCoverage, SkillsViewMode } from "../types/skills";

interface SkillsTeamToolbarProps {
  viewMode: SkillsViewMode;
  onViewModeChange: (mode: SkillsViewMode) => void;
  memberCount: number;
  isMobile: boolean;
  onFiltersOpen: () => void;
  coverage: SkillCoverage[];
  visibleSkillIds: Set<number>;
  onVisibleSkillIdsChange: (ids: Set<number>) => void;
}

export const SkillsTeamToolbar: React.FC<SkillsTeamToolbarProps> = ({
  viewMode,
  onViewModeChange,
  memberCount,
  isMobile,
  onFiltersOpen,
  coverage,
  visibleSkillIds,
  onVisibleSkillIdsChange,
}) => (
  <GlassCard isHoverLift={false} className="p-3">
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            View
          </span>
          <div
            className="flex flex-wrap rounded-xl border border-border bg-muted/30 p-1 shadow-inner"
            role="group"
            aria-label="Skills view"
          >
            <Button
              type="button"
              size="sm"
              variant={viewMode === "matrix" ? "secondary" : "ghost"}
              aria-pressed={viewMode === "matrix"}
              onClick={() => onViewModeChange("matrix")}
            >
              <Grid2X2 className="mr-2 h-4 w-4" aria-hidden="true" /> Matrix
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === "dense" ? "secondary" : "ghost"}
              aria-pressed={viewMode === "dense"}
              onClick={() => onViewModeChange("dense")}
            >
              <LayoutGrid className="mr-2 h-4 w-4" aria-hidden="true" /> Dense
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === "heatmap" ? "secondary" : "ghost"}
              aria-pressed={viewMode === "heatmap"}
              onClick={() => onViewModeChange("heatmap")}
            >
              <Flame className="mr-2 h-4 w-4" aria-hidden="true" /> Heatmap
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === "list" ? "secondary" : "ghost"}
              aria-pressed={viewMode === "list"}
              onClick={() => onViewModeChange("list")}
            >
              <List className="mr-2 h-4 w-4" aria-hidden="true" /> List
            </Button>
          </div>
        </div>
        <span
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 text-sm text-emerald-800 dark:text-emerald-400"
          aria-label={`${memberCount} team members loaded`}
        >
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"
          />
          <Users className="h-4 w-4" aria-hidden="true" />
          {memberCount} Members
        </span>
        {isMobile && (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={onFiltersOpen}
            aria-label="Filters"
          >
            <Filter className="mr-2 h-4 w-4" aria-hidden="true" /> Filters
          </Button>
        )}
      </div>
      <SkillsColumnSelector
        coverage={coverage}
        visibleSkillIds={visibleSkillIds}
        onVisibleSkillIdsChange={onVisibleSkillIdsChange}
      />
    </div>
  </GlassCard>
);
