import React from "react";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import type { CalendarDensity, CalendarEvent } from "./types";
import { getInitials } from "./initials";
import { calendarEventTypeStyles } from "./calendarStyles";

interface EventCardProps extends HTMLAttributes<HTMLDivElement> {
  event: CalendarEvent;
  density?: CalendarDensity;
  onActivate?: () => void;
}

export const EventCard = React.forwardRef<HTMLDivElement, EventCardProps>(
  ({ event, density = "normal", className, onActivate, onKeyDown, ...props }, ref) => {
    // Colors follow the event type so the MonthGrid matches the sidebar
    // legend, WeekView, and ListView (all derive from calendarStyles.ts).
    const styles = calendarEventTypeStyles[event.type];
    const initials = getInitials(event.userName ?? event.title);
    // Compact pills truncate the label, so the "(8h)" / "(3d)" quantity moves to its own chip.
    const fullLabel = event.compactLabel ?? event.title;
    const compactText = fullLabel.replace(/\s*\([^)]*\)/, "");
    const hours = Number(event.hours);
    const quantity =
      typeof event.days === "number"
        ? `${event.days}d`
        : event.hours != null && Number.isFinite(hours)
          ? `${hours}h`
          : null;

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
          "focus-visible:ring-ring/30 w-full rounded-lg border text-left text-xs leading-tight transition focus-visible:ring-1",
          density === "compact" ? "px-1.5 py-0.5" : "px-1.5 py-1",
          styles.surface,
          "hover:border-foreground/30 dark:hover:border-foreground/40 hover:-translate-y-0.5 hover:shadow-md",
          className
        )}
      >
        {density === "compact" ? (
          <div className="flex min-w-0 items-center justify-between gap-1 @max-[5rem]:justify-center">
            <div className="flex min-w-0 items-center gap-1 truncate">
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded text-xs font-bold",
                  styles.chip
                )}
              >
                {initials}
              </span>
              <p
                className={cn("truncate text-xs font-medium @max-[5rem]:hidden", styles.meta)}
                title={fullLabel}
              >
                {compactText}
              </p>
            </div>
            {event.status === "pending" && (
              <span
                className="bg-warning h-1.5 w-1.5 shrink-0 rounded-full @max-[5rem]:hidden"
                title="Pending approval"
                aria-hidden
              />
            )}
            {quantity && (
              <span className="shrink-0 font-mono text-xs opacity-75 @max-[5rem]:hidden">
                {quantity}
              </span>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded text-xs font-bold",
                  styles.chip
                )}
              >
                {initials}
              </span>
              {event.status === "pending" && (
                <span
                  className="bg-warning ml-auto h-1.5 w-1.5 shrink-0 rounded-full"
                  title="Pending approval"
                  aria-hidden
                />
              )}
            </div>
            <p
              className={cn("mt-0.5 truncate text-xs", styles.meta)}
              title={event.compactLabel ?? event.title}
            >
              {event.compactLabel ?? event.title}
            </p>
          </>
        )}
      </div>
    );
  }
);

EventCard.displayName = "EventCard";
