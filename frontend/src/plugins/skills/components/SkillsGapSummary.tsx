import React from "react";
import { TrendingDown } from "lucide-react";
import type { SkillCoverage } from "../types/skills";

interface SkillsGapSummaryProps {
  gaps: SkillCoverage[];
}

/** Compact horizontal gap bar showing up to five lowest-average skills. */
export const SkillsGapSummary: React.FC<SkillsGapSummaryProps> = ({ gaps }) => {
  if (gaps.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <TrendingDown className="h-4 w-4 shrink-0 text-warning" />
      <span className="shrink-0 text-sm font-semibold">Gaps ({gaps.length})</span>
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {gaps.slice(0, 5).map((g) => (
          <span
            key={g.skill_id}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-2 py-1 font-mono text-xs"
          >
            {g.skill_name}: avg L{g.avg_level}
          </span>
        ))}
      </div>
    </div>
  );
};
