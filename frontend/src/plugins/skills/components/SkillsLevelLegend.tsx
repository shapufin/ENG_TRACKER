/** Shared L1–L5 + Unrated color legend (single source of truth). */

import React from "react";
import { PROFICIENCY_LEVELS, levelDot } from "../utils/proficiencyLevels";

interface SkillsLevelLegendProps {
  className?: string;
}

export const SkillsLevelLegend: React.FC<SkillsLevelLegendProps> = ({ className }) => (
  <div
    className={
      className ??
      "flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground"
    }
    role="list"
    aria-label="Proficiency level color legend"
  >
    <span className="font-medium" aria-hidden="true">
      Proficiency
    </span>
    {PROFICIENCY_LEVELS.map((level) => (
      <span key={level.level} role="listitem" className="flex items-center gap-1.5">
        <span className={`h-2.5 w-2.5 rounded-full ${levelDot(level.level)}`} aria-hidden="true" />
        <span>
          L{level.level} {level.label}
        </span>
      </span>
    ))}
    <span role="listitem" className="flex items-center gap-1.5">
      <span
        className="h-2.5 w-2.5 rounded-full border border-border/70 bg-transparent"
        aria-hidden="true"
      />
      <span>Unrated</span>
    </span>
  </div>
);
