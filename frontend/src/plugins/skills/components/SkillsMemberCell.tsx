import React from "react";
import { cn } from "@/lib/utils";
import type { TeamMatrixRow } from "../types/skills";

/** Gradient chip pairs (mockup member avatars) — slate/zinc excluded (D2). */
const GRADIENTS = [
  "from-amber-500 to-rose-600",
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-violet-500 to-fuchsia-600",
  "from-cyan-500 to-blue-600",
  "from-orange-500 to-amber-600",
  "from-rose-500 to-red-600",
  "from-lime-500 to-emerald-600",
] as const;

const initialsOf = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0].charAt(0);
  const second = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return `${first}${second}`.toUpperCase();
};

interface SkillsMemberCellProps {
  row: TeamMatrixRow;
  /** Compact: single line (avatar + name) for h-7 virtualized grid rows. */
  compact?: boolean;
  className?: string;
}

export const SkillsMemberCell: React.FC<SkillsMemberCellProps> = ({
  row,
  compact = false,
  className,
}) => {
  const displayName = row.full_name?.trim() || row.username;
  const gradient = GRADIENTS[row.user_id % GRADIENTS.length];
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "flex shrink-0 items-center justify-center bg-gradient-to-br font-bold uppercase text-white shadow-sm ring-1 ring-white/10",
          compact ? "h-6 w-6 rounded-md text-[9px]" : "h-7 w-7 rounded-lg text-[10px]",
          gradient
        )}
      >
        {initialsOf(displayName)}
      </span>
      {compact ? (
        <span className="truncate text-xs font-medium" title={`${displayName} (@${row.username})`}>
          {displayName}
        </span>
      ) : (
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium leading-tight" title={displayName}>
            {displayName}
          </span>
          {displayName !== row.username && (
            <span
              className="block truncate text-[10px] leading-tight text-muted-foreground"
              title={row.username}
            >
              @{row.username}
            </span>
          )}
        </span>
      )}
    </div>
  );
};
