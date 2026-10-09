import React from "react";
import { Calendar, Clock, Cpu, User, MessageSquare, Briefcase } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { CalendarEvent } from "./types";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { calendarEventTypeStyles } from "./calendarStyles";

interface EventTooltipProps {
  event: CalendarEvent;
  children: React.ReactNode;
  onUserClick?: (userId: number) => void;
  onEventActivate?: (event: CalendarEvent) => void;
}

const typeAccents: Record<CalendarEvent["type"], string> = {
  vacation: "from-emerald-500/30 to-emerald-500/5",
  standby: "from-amber-500/30 to-amber-500/5",
  sick: "from-rose-500/30 to-rose-500/5",
  holiday: "from-sky-500/30 to-sky-500/5",
};

export const EventTooltip: React.FC<EventTooltipProps> = ({
  event,
  children,
  onUserClick,
  onEventActivate,
}) => {
  const startDate = format(parseISO(event.start), "PP");
  const endDate = format(parseISO(event.end), "PP");
  const dateDisplay = event.start === event.end ? startDate : `${startDate} → ${endDate}`;

  // Clone child to inject onActivate prop
  const childWithActivate = React.cloneElement(
    children as React.ReactElement,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { onActivate: () => onEventActivate?.(event) } as any
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{childWithActivate}</TooltipTrigger>
      <TooltipContent
        side="top"
        align="center"
        className="border-line-subtle bg-popover/95 text-popover-foreground w-72 border p-0 backdrop-blur-xl"
      >
        <div className="border-line-subtle from-muted/50 relative overflow-hidden rounded-xl border bg-linear-to-br to-transparent p-3">
          <div
            className={cn(
              "pointer-events-none absolute inset-0 opacity-60",
              typeAccents[event.type]
            )}
          />
          <div className="relative space-y-2 text-left">
            <div className="flex items-center justify-between gap-2">
              <p className="text-foreground text-sm font-semibold">{event.title}</p>
              {typeof event.days === "number" && (
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 font-mono text-xs font-bold",
                    calendarEventTypeStyles[event.type].badge
                  )}
                >
                  {event.days}d
                </span>
              )}
            </div>
            <div className="text-foreground space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" />
                <span>{dateDisplay}</span>
              </div>
              {typeof event.hours === "number" && (
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{event.hours}h logged</span>
                </div>
              )}
              {typeof event.days === "number" && (
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{event.days} day(s)</span>
                </div>
              )}
              {event.userName && (
                <button
                  type="button"
                  className="text-foreground hover:text-primary flex items-center gap-2 transition"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (event.userId) onUserClick?.(event.userId);
                  }}
                >
                  <User className="h-3.5 w-3.5" />
                  <span className="font-medium">{event.userName}</span>
                </button>
              )}
              {(event.userTechLevels?.length ?? 0) > 0 && (
                <div className="flex items-center gap-2">
                  <Cpu className="h-3.5 w-3.5" />
                  <span>{event.userTechLevels!.join(" · ")}</span>
                </div>
              )}
              {event.clientNames && event.clientNames.length > 0 && (
                <div className="flex items-center gap-2">
                  <Briefcase className="h-3.5 w-3.5" />
                  <span>{event.clientNames.join(", ")}</span>
                </div>
              )}
              {event.description && (
                <div className="border-line-subtle bg-surface-sunken flex gap-2 rounded-lg border p-2">
                  <MessageSquare className="text-muted-foreground mt-0.5 h-3.5 w-3.5" />
                  <p className="text-foreground text-xs">{event.description}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
};
