import React from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toneFillClass, type Tone } from "@/components/ui/tone";
import type { CalendarEvent } from "./types";

interface OverflowTooltipProps {
  events: CalendarEvent[];
  dateLabel: string;
  children: React.ReactNode;
  delayDuration?: number;
}

const typeTone: Record<CalendarEvent["type"], Tone> = {
  vacation: "success",
  standby: "warning",
  sick: "danger",
  holiday: "info",
};

/** Previews the entries a day's "+N more" button is hiding. */
export const OverflowTooltip: React.FC<OverflowTooltipProps> = ({
  events,
  dateLabel,
  children,
  delayDuration,
}) => (
  <TooltipProvider delayDuration={delayDuration}>
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" className="w-56 rounded-2xl p-3">
        <div className="space-y-1.5 text-left">
          <p className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
            {events.length} more on {dateLabel}
          </p>
          <ul className="max-h-40 space-y-1 overflow-hidden">
            {events.map((evt) => (
              <li key={evt.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      toneFillClass[typeTone[evt.type]]
                    )}
                  />
                  <span className="text-foreground truncate font-semibold">
                    {evt.userName ?? evt.title}
                  </span>
                </span>
                <span className="text-muted-foreground shrink-0 font-mono capitalize">
                  {evt.type}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);
