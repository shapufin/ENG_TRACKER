import React from "react";
import { Briefcase, Clock, Cpu, ShieldAlert } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { CalendarEvent } from "./types";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toneFillClass, toneSurfaceClass, toneTextClass, type Tone } from "@/components/ui/tone";

interface EventTooltipProps {
  event: CalendarEvent;
  children: React.ReactNode;
  /** The event's day is at or below the coverage threshold. */
  hasConflict?: boolean;
  onUserClick?: (userId: number) => void;
  onEventActivate?: (event: CalendarEvent) => void;
}

const typeTone: Record<CalendarEvent["type"], Tone> = {
  vacation: "success",
  standby: "warning",
  sick: "danger",
  holiday: "info",
};

const typeLabel: Record<CalendarEvent["type"], string> = {
  vacation: "Vacation",
  standby: "Standby",
  sick: "Sick leave",
  holiday: "Holiday",
};

/** Concise hover card: who, what kind, when, how much, plus a coverage warning when relevant. */
export const EventTooltip: React.FC<EventTooltipProps> = ({
  event,
  children,
  hasConflict,
  onUserClick,
  onEventActivate,
}) => {
  // "Nov 17 → Nov 19" stays on one line; the year is only spelled out when the span crosses years.
  const start = parseISO(event.start);
  const end = parseISO(event.end);
  const dateFormat = start.getFullYear() === end.getFullYear() ? "MMM d" : "PP";
  const startDate = format(start, dateFormat);
  const endDate = format(end, dateFormat);
  const dateDisplay = event.start === event.end ? startDate : `${startDate} → ${endDate}`;
  const tone = typeTone[event.type];

  // Clone child to inject onActivate prop
  const childWithActivate = React.cloneElement(
    children as React.ReactElement,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { onActivate: () => onEventActivate?.(event) } as any
  );

  const hours = Number(event.hours);
  const quantity =
    typeof event.days === "number"
      ? `${event.days}d`
      : event.hours != null && Number.isFinite(hours)
        ? `${hours}h`
        : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{childWithActivate}</TooltipTrigger>
      <TooltipContent
        side="top"
        align="center"
        className="border-line-subtle bg-popover/95 text-popover-foreground w-64 rounded-2xl border p-3 backdrop-blur-xl"
      >
        <div className="space-y-2 text-left">
          <div className="flex items-center justify-between gap-2">
            {event.userName ? (
              <button
                type="button"
                className="text-foreground hover:text-primary min-w-0 truncate text-sm font-bold transition"
                aria-label={event.userName}
                onClick={(e) => {
                  e.stopPropagation();
                  if (event.userId) onUserClick?.(event.userId);
                }}
              >
                {event.userName}
              </button>
            ) : (
              <p className="text-foreground min-w-0 truncate text-sm font-bold">{event.title}</p>
            )}
            {quantity && (
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 font-mono text-xs font-bold",
                  toneSurfaceClass[tone]
                )}
              >
                {quantity}
              </span>
            )}
          </div>

          <div className="border-line-subtle space-y-1.5 border-t pt-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <span className={cn("h-1.5 w-1.5 rounded-full", toneFillClass[tone])} />
                {typeLabel[event.type]}
              </span>
              <span className="text-foreground font-mono font-semibold whitespace-nowrap">
                {dateDisplay}
              </span>
            </div>
            {(event.userTechLevels?.length ?? 0) > 0 && (
              <div className="text-muted-foreground flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5" />
                <span>{event.userTechLevels!.join(" · ")}</span>
              </div>
            )}
            {event.clientNames && event.clientNames.length > 0 && (
              <div className="text-muted-foreground flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5" />
                <span>{event.clientNames.join(", ")}</span>
              </div>
            )}
            {event.status === "pending" && (
              <div className={cn("flex items-center gap-1.5", toneTextClass.warning)}>
                <Clock className="h-3.5 w-3.5" />
                <span>Pending approval</span>
              </div>
            )}
            {event.description && (
              <p className="text-muted-foreground italic">&ldquo;{event.description}&rdquo;</p>
            )}
          </div>

          {hasConflict && (
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold",
                toneSurfaceClass.warning
              )}
            >
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              <span>Coverage warning (50% capacity or less)</span>
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};
