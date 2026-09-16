import React from "react";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "./types";
import { getInitials } from "./initials";
import { calendarEventTypeStyles } from "./calendarStyles";

interface EventCardProps extends HTMLAttributes<HTMLDivElement> {
  event: CalendarEvent;
  onActivate?: () => void;
}

export const EventCard = React.forwardRef<HTMLDivElement, EventCardProps>(
  ({ event, className, onActivate, onKeyDown, ...props }, ref) => {
    // Colors follow the event type so the MonthGrid matches the sidebar
    // legend, WeekView, and ListView (all derive from calendarStyles.ts).
    const styles = calendarEventTypeStyles[event.type];
    const initials = getInitials(event.userName ?? event.title);

    return (
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onActivate?.();
        }}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.defaultPrevented) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            onActivate?.();
          }
        }}
        {...props}
        className={cn(
          "w-full rounded-lg border px-1.5 py-1 text-left text-[10px] leading-tight transition focus-visible:ring-1 focus-visible:ring-ring/30",
          styles.surface,
          "hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-md dark:hover:border-foreground/40",
          className
        )}
      >
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold",
              styles.chip
            )}
          >
            {initials}
          </span>
          {event.status === "pending" && (
            <span
              className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500 dark:bg-orange-400"
              title="Pending approval"
              aria-hidden
            />
          )}
        </div>
        <p
          className={cn("mt-0.5 truncate text-[9.5px]", styles.meta)}
          title={event.compactLabel ?? event.title}
        >
          {event.compactLabel ?? event.title}
        </p>
      </div>
    );
  }
);

EventCard.displayName = "EventCard";
