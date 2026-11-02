import React from "react";
import { ShieldAlert } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toneTextClass } from "@/components/ui/tone";
import type { DayConflict } from "@/lib/calendarCoverage";

interface ConflictTooltipProps {
  conflict: DayConflict;
  children: React.ReactNode;
  delayDuration?: number;
}

/** Hover/focus explanation of a day's coverage badge: how many are on duty and who is away. */
export const ConflictTooltip: React.FC<ConflictTooltipProps> = ({
  conflict,
  children,
  delayDuration,
}) => (
  <TooltipProvider delayDuration={delayDuration}>
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" className="w-60 rounded-2xl p-3">
        <div className="space-y-1.5 text-left">
          <div className={`flex items-center gap-1.5 text-xs font-bold ${toneTextClass.warning}`}>
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>Coverage conflict</span>
          </div>
          <p className="text-foreground text-xs">
            <span className={`font-mono font-bold ${toneTextClass.warning}`}>
              {conflict.coveragePct}% on duty
            </span>{" "}
            ({conflict.total - conflict.away} of {conflict.total})
          </p>
          <p className="text-muted-foreground text-xs">
            Away: {conflict.users.map((u) => u.name).join(", ")}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);
