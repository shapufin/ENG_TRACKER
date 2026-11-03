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
        {density === "compact" ? (
          <div className="flex min-w-0 items-center justify-between gap-1 @max-[5rem]:justify-center">
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
                  "truncate text-[10px] font-semibold sm:text-[11px] @max-[5rem]:hidden",
                  styles.meta
                )}
                title={fullLabel}
              >
                {compactText}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {event.status === "pending" && (
                <span
                  className="bg-warning h-1.5 w-1.5 shrink-0 rounded-full @max-[5rem]:hidden"
                  title="Pending approval"
                  aria-hidden
                />
              )}
              {quantity && (
                <span className="shrink-0 font-mono text-[9px] opacity-75 @max-[5rem]:hidden">
                  {quantity}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 items-center justify-between gap-1">
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
                className={cn("truncate text-[10px] font-semibold sm:text-[11px]", styles.meta)}
                title={fullLabel}
              >
                {fullLabel}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {event.status === "pending" && (
                <span
                  className="bg-warning h-1.5 w-1.5 shrink-0 rounded-full"
                  title="Pending approval"
                  aria-hidden
                />
              )}
              {quantity && (
                <span className="shrink-0 font-mono text-[9px] opacity-75">{quantity}</span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
);

EventCard.displayName = "EventCard";
