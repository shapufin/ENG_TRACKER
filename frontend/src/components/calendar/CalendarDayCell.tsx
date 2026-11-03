import React from "react";
import { format, isSameDay } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { businessToday } from "@/lib/date-format-utils";
import { cn } from "@/lib/utils";
import { EventTooltip } from "./EventTooltip";
import { ConflictTooltip } from "./ConflictTooltip";
import { OverflowTooltip } from "./OverflowTooltip";
import type { CalendarDensity, CalendarEvent } from "./types";
import { EventCard } from "./EventCard";
import { toneSurfaceClass } from "@/components/ui/tone";
import type { DayConflict } from "@/lib/calendarCoverage";

interface CalendarDayCellProps {
  date: Date;
  events: CalendarEvent[];
  isCurrentMonth: boolean;
  isSelected?: boolean;
  isRangeEnd?: boolean;
  isRangeStart?: boolean;
  isInRange?: boolean;
  density?: CalendarDensity;
  onSelect: (date: Date) => void;
  /** Opens the day's full entry list from "+N more"; falls back to `onSelect`. */
  onShowDayEvents?: (date: Date) => void;
  onUserClick?: (userId: number) => void;
  onEventActivate?: (event: CalendarEvent) => void;
  onRangeDragStart?: (date: Date) => void;
  onRangeDragEnter?: (date: Date) => void;
  onRangeDragEnd?: (date: Date) => void;
  isRangeSelecting?: boolean;
  /** Staffing conflict for this day (coverage at or below 50%). */
  conflict?: DayConflict;
}

export const CalendarDayCell: React.FC<CalendarDayCellProps> = ({
  date,
  events,
  isCurrentMonth,
  isSelected,
  isRangeEnd,
  isRangeStart,
  isInRange,
  density = "normal",
  onSelect,
  onShowDayEvents,
  onUserClick,
  onEventActivate,
  onRangeDragStart,
  onRangeDragEnter,
  onRangeDragEnd,
  isRangeSelecting,
  conflict,
}) => {
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  const today = isSameDay(date, businessToday());
  const isPlainCell = !today && !isSelected && !isRangeStart && !isRangeEnd && !isInRange;

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!onRangeDragStart) return;
    e.preventDefault();
    onRangeDragStart(date);
  };

  const handlePointerEnter = (e: React.MouseEvent) => {
    if (!isRangeSelecting || !onRangeDragEnter) return;
    e.preventDefault();
    onRangeDragEnter(date);
  };

  const handlePointerUp = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isRangeSelecting || !onRangeDragEnd) return;
    e.preventDefault();
    onRangeDragEnd(date);
  };

  const maxSlots = density === "compact" ? 3 : 2;
  const visibleEvents = events.slice(0, maxSlots);
  const overflowEvents = Math.max(0, events.length - visibleEvents.length);

  return (
    <div
      role="gridcell"
      tabIndex={0}
      aria-selected={isSelected || undefined}
      aria-label={format(date, "EEEE, MMMM d, yyyy")}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(date);
        }
      }}
      onMouseDown={handlePointerDown}
      onMouseEnter={handlePointerEnter}
      onMouseUp={handlePointerUp}
      onTouchStart={handlePointerDown}
      onTouchEnd={handlePointerUp}
      className={cn(
        "group bg-card text-foreground focus-visible:ring-ring/60 @container relative flex h-full flex-col gap-1 transition duration-200 focus-visible:ring-1 focus-visible:ring-inset",
        "min-h-0 p-1 sm:p-1.5",
        isPlainCell && "hover:bg-card-raised",
        !isCurrentMonth && "bg-card text-muted-foreground/60",
        isCurrentMonth && isWeekend && "bg-muted/30",
        conflict && "border-tone-warning-border z-10 border-2",
        today && "calendar-today-glow border-info/40 border",
        isSelected && "border-primary/80 bg-primary/15 dark:bg-primary/[0.12] border",
        isRangeStart && "ring-primary/70 dark:ring-primary/50 ring-2 ring-inset",
        isRangeEnd && "ring-primary/70 dark:ring-primary/50 ring-2 ring-inset",
        isInRange &&
          "border-primary/30 bg-primary/10 dark:border-primary/20 dark:bg-primary/[0.06] border",
        isRangeSelecting && "cursor-crosshair"
      )}
    >
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-1">
          <span
            className={cn(
              "flex h-4.5 w-4.5 items-center justify-center rounded-full font-mono text-[11px] font-semibold sm:h-5 sm:w-5",
              isSelected
                ? "bg-primary text-primary-foreground"
                : today
                  ? "bg-info text-info-foreground"
                  : isCurrentMonth
                    ? "text-foreground"
                    : "text-muted-foreground/50"
            )}
          >
            {format(date, "d")}
          </span>
          {today && (
            <span className="border-info/20 bg-info/10 text-info py-0.2 hidden rounded px-1 font-mono text-[9px] font-bold tracking-wide uppercase @[5rem]:inline">
              Today
            </span>
          )}
        </div>
        {conflict && (
          <ConflictTooltip conflict={conflict}>
            <span
              tabIndex={0}
              aria-label={`Staffing conflict: ${conflict.away} of ${conflict.total} away, ${conflict.coveragePct}% coverage`}
              title={`${conflict.away} of ${conflict.total} away, ${conflict.coveragePct}% coverage`}
              className={cn(
                "py-0.2 flex items-center gap-1 rounded-md border px-1 font-mono text-[10px] font-semibold @[5rem]:px-1.5",
                toneSurfaceClass.warning
              )}
            >
              <AlertTriangle className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
              <span className="hidden @[5rem]:inline">{conflict.coveragePct}%</span>
            </span>
          </ConflictTooltip>
        )}
        {isCurrentMonth && !today && (
          <span
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none hidden text-[10px] font-semibold opacity-0 transition-opacity duration-150 group-hover:opacity-100 md:inline"
          >
            + Book
          </span>
        )}
      </div>

      <div className="flex w-full flex-1 flex-col gap-0.5 overflow-hidden text-left">
        {visibleEvents.map((evt) => (
          <EventTooltip
            key={evt.id}
            event={evt}
            onUserClick={onUserClick}
            onEventActivate={onEventActivate}
            hasConflict={!!conflict}
          >
            <EventCard event={evt} density={density} />
          </EventTooltip>
        ))}
      </div>
      {overflowEvents > 0 && (
        <OverflowTooltip
          events={events.slice(visibleEvents.length)}
          dateLabel={format(date, "MMM d")}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              (onShowDayEvents ?? onSelect)(date);
            }}
            aria-label={`View ${overflowEvents} more events for ${format(date, "MMMM d")}`}
            className="text-muted-foreground hover:text-foreground hover:bg-muted/60 focus-visible:ring-ring inline-flex w-fit items-center rounded px-1 py-0.5 text-xs font-semibold tracking-wide uppercase transition focus:outline-none focus-visible:ring-1"
          >
            +{overflowEvents} more
          </button>
        </OverflowTooltip>
      )}
    </div>
  );
};
