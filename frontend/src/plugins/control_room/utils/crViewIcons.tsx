/**
 * crViewIcons.tsx — React components for Control Room views.
 *
 * Kept as a .tsx file (separate from crViewHelpers.ts pure functions)
 * to satisfy react-refresh/only-export-components: a .tsx file that
 * exports React components must not also export plain functions.
 *
 * Exports:
 *   OvernightIcon — Moon icon for overnight shifts.
 *   TeamChipList  — Inline colored team chips (used by CRWeekView + CRByDayView).
 */
import React from "react";
import { Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { teamColorFor } from "./crViewHelpers";

interface OvernightIconProps {
  size?: "sm" | "xs";
  className?: string;
}

/** Moon icon for overnight shifts. Size: "sm" (h-3.5) or "xs" (h-2). */
export const OvernightIcon: React.FC<OvernightIconProps> = ({ size = "sm", className }) => (
  <Moon
    className={cn(
      size === "sm" ? "h-3.5 w-3.5" : "h-2 w-2",
      "shrink-0 text-indigo-500 dark:text-indigo-400",
      className
    )}
  />
);

// ---------------------------------------------------------------------------
// TeamChipList
// ---------------------------------------------------------------------------

interface TeamChipListProps {
  teamNames: string[];
  className?: string;
}

/**
 * Renders an inline row of team chips with a deterministic color dot.
 *
 * Extracted from CRWeekView and CRByDayView to eliminate duplication.
 * Does not render when `teamNames` is empty.
 */
export const TeamChipList: React.FC<TeamChipListProps> = ({ teamNames, className }) => {
  if (teamNames.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {teamNames.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", teamColorFor(t))} />
          {t}
        </span>
      ))}
    </div>
  );
};
