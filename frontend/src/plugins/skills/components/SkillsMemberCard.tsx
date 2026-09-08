import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { SkillsMemberDetail } from "./SkillsMemberDetail";
import { SkillsMemberCell } from "./SkillsMemberCell";
import type { SkillCoverage, TeamMatrixRow } from "../types/skills";
import type { SkillRateTarget } from "./SkillsMemberList";

interface SkillsMemberCardProps {
  rows: TeamMatrixRow[];
  coverage: SkillCoverage[];
  expandedUserId: number | null;
  onExpandedUserIdChange: (id: number | null) => void;
  onRate: (target: SkillRateTarget) => void;
}

/** Mobile expandable member card list — replaces the desktop matrix on phone widths. */
export const SkillsMemberCard: React.FC<SkillsMemberCardProps> = ({
  rows,
  coverage,
  expandedUserId,
  onExpandedUserIdChange,
  onRate,
}) => (
  <div className="space-y-2">
    {rows.map((row) => {
      const isExpanded = expandedUserId === row.user_id;
      return (
        <GlassCard key={row.user_id} isHoverLift={false}>
          <button
            type="button"
            onClick={() => onExpandedUserIdChange(isExpanded ? null : row.user_id)}
            className="flex min-h-[44px] w-full items-center gap-2 p-3 text-left font-medium"
            aria-expanded={isExpanded}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <SkillsMemberCell row={row} className="min-w-0" />
          </button>
          {isExpanded && <SkillsMemberDetail row={row} coverage={coverage} onRate={onRate} />}
        </GlassCard>
      );
    })}
  </div>
);
