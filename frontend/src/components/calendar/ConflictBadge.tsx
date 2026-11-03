import React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneSurfaceClass } from "@/components/ui/tone";
import type { DayConflict } from "@/lib/calendarCoverage";
import { ConflictTooltip } from "./ConflictTooltip";

/** Compact staffing-conflict badge for day headers (week and timeline views). */
export const ConflictBadge: React.FC<{ conflict: DayConflict; compact?: boolean }> = ({
  conflict,
  compact,
}) => (
  <ConflictTooltip conflict={conflict}>
    <span
      tabIndex={0}
      aria-label={`Staffing conflict: ${conflict.away} of ${conflict.total} away, ${conflict.coveragePct}% coverage`}
      title={`${conflict.away} of ${conflict.total} away, ${conflict.coveragePct}% coverage`}
      className={cn(
        "flex items-center justify-center gap-1 rounded-md border px-1 py-0.5 font-mono text-xs font-semibold",
        toneSurfaceClass.warning
      )}
    >
      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      {!compact && `${conflict.coveragePct}%`}
    </span>
  </ConflictTooltip>
);
