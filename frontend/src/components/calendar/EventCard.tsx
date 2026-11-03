import React from "react";
import type { HTMLAttributes } from "react";
import { CalendarDays } from "lucide-react";
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
  (
    { event, density = "normal", className, onActivate, onKeyDown, onClick, onMouseDown, ...props },
    ref
  ) => {
    // Colors follow the event type so the MonthGrid matches the sidebar
    // legend, WeekView, and ListView (all derive from calendarStyles.ts).
    const styles = calendarEventTypeStyles[event.type];

    if (event.type === "holiday") {
      return (
        <div
          ref={ref}
          role="button"
          tabIndex={0}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onMouseDown?.(e);
          }}
          onClick={(e) => {
            e.stopPropagation();
            onActivate?.();
            onClick?.(e);
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
            "focus-visible:ring-ring/30 w-full rounded-md border text-left text-[11px] leading-tight transition focus-visible:ring-1",
            "px-1 py-0.5 sm:px-1.5",
            styles.surface,
            "hover:border-foreground/30 dark:hover:border-foreground/40 hover:-translate-y-0.5 hover:shadow-2xs",
            className
          )}
        >
          <div className="flex min-w-0 items-center gap-1 truncate">
            <CalendarDays className="h-2.5 w-2.5 shrink-0 text-sky-500" />
            <p
              className={cn("truncate text-[10px] font-semibold sm:text-[11px]", styles.meta)}
              title={event.title}
            >
              {event.title}
            </p>
          </div>
        </div>
      );
    }

    const initials = getInitials(event.userName ?? event.title);
    // Strip parenthetical duration e.g. "(15h)" or "(8h)" from standby to keep the cell pill clean and uncluttered.
    // The exact duration and details are displayed in the hover popover / modal.
    const fullLabel = event.compactLabel ?? event.title;
    const cleanLabel =
      event.type === "standby" ? fullLabel.replace(/\s*\(\d+(?:\.\d+)?h\)/, "").trim() : fullLabel;

    const statusTitle =
      event.status === "approved"
        ? "Approved"
        : event.status === "pending"
          ? "Pending approval"
          : "Rejected";

    const statusColor =
      event.status === "approved"
        ? "bg-emerald-500"
        : event.status === "pending"
          ? "bg-amber-500"
          : "bg-rose-500";

    return (
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onMouseDown?.(e);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onActivate?.();
          onClick?.(e);
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
          "focus-visible:ring-ring/30 w-full rounded-md border text-left text-[11px] leading-tight transition focus-visible:ring-1",
          "px-1 py-0.5 sm:px-1.5",
          styles.surface,
          "hover:border-foreground/30 dark:hover:border-foreground/40 hover:-translate-y-0.5 hover:shadow-2xs",
          className
        )}
      >
        <div
          className={cn(
            "flex min-w-0 items-center justify-between gap-1",
            density === "compact" && "@max-[5rem]:justify-center"
          )}
        >
          <div className="flex min-w-0 items-center gap-1 truncate">
            <span
              className={cn(
                "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded text-[9px] font-bold",
                styles.chip
              )}
            >
              {initials}
            </span>
            <p
              className={cn(
                "truncate text-[10px] font-semibold sm:text-[11px]",
                density === "compact" && "@max-[5rem]:hidden",
                styles.meta
              )}
              title={fullLabel}
            >
              {cleanLabel}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                statusColor,
                density === "compact" && "@max-[5rem]:hidden"
              )}
              title={statusTitle}
              aria-hidden
            />
          </div>
        </div>
      </div>
    );
  }
);

EventCard.displayName = "EventCard";
