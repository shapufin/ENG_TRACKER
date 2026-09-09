/** Proficiency badge showing a 1-5 level with color, dot swatch, and optional label. */
import React from "react";
import { cn } from "@/lib/utils";
import { levelColor, levelDot, levelLabel } from "../utils/proficiencyLevels";

interface ProficiencyBadgeProps {
  level: number;
  showLabel?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export const ProficiencyBadge: React.FC<ProficiencyBadgeProps> = ({
  level,
  showLabel = false,
  size = "md",
  className,
}) => {
  const colorClass = levelColor(level);
  const dotClass = levelDot(level);
  const sizeClass = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border font-mono font-semibold tabular-nums",
        colorClass,
        sizeClass,
        className
      )}
      title={levelLabel(level)}
      aria-label={`Proficiency level ${level}: ${levelLabel(level)}`}
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", dotClass)} aria-hidden="true" />
      {level}
      {showLabel && <span>{levelLabel(level)}</span>}
    </span>
  );
};
