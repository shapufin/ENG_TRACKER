import React from "react";
import { Calendar, Clock, User, MessageSquare } from "lucide-react";
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
        className="w-72 border border-line-subtle bg-popover/95 p-0 text-popover-foreground backdrop-blur-xl"
      >
        <div className="relative overflow-hidden rounded-xl border border-line-subtle bg-gradient-to-br from-muted/50 to-transparent p-3">
          <div
            className={cn(
              "pointer-events-none absolute inset-0 opacity-60",
              typeAccents[event.type]
            )}
          />
          <div className="relative space-y-2 text-left">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground dark:text-white">{event.title}</p>
              {typeof event.days === "number" && (
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold",
                    calendarEventTypeStyles[event.type].badge
                  )}
                >
                  {event.days}d
                </span>
              )}
            </div>
            <div className="space-y-1.5 text-[11px] text-foreground dark:text-white/80">
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
                  className="flex items-center gap-2 text-foreground transition hover:text-primary dark:text-white dark:hover:text-primary/80"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (event.userId) onUserClick?.(event.userId);
                  }}
                >
                  <User className="h-3.5 w-3.5" />
                  <span className="font-medium">{event.userName}</span>
                </button>
              )}
              {event.description && (
                <div className="flex gap-2 rounded-lg border border-line-subtle bg-surface-sunken p-2">
                  <MessageSquare className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-[10px] text-foreground dark:text-white/85">
                    {event.description}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
};
