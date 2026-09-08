import React from "react";
import { format, isToday, isWeekend } from "date-fns";
import { cn } from "@/lib/utils";
import { EventTooltip } from "./EventTooltip";
import type { CalendarEvent } from "./types";
import { EventCard } from "./EventCard";

interface CalendarDayCellProps {
  date: Date;
  events: CalendarEvent[];
  isCurrentMonth: boolean;
  isSelected?: boolean;
  isRangeEnd?: boolean;
  isRangeStart?: boolean;
  isInRange?: boolean;
  onSelect: (date: Date) => void;
  onUserClick?: (userId: number) => void;
  onEventActivate?: (event: CalendarEvent) => void;
  onRangeDragStart?: (date: Date) => void;
  onRangeDragEnter?: (date: Date) => void;
  onRangeDragEnd?: (date: Date) => void;
  isRangeSelecting?: boolean;
}

export const CalendarDayCell: React.FC<CalendarDayCellProps> = ({
  date,
  events,
  isCurrentMonth,
  isSelected,
  isRangeEnd,
  isRangeStart,
  isInRange,
  onSelect,
  onUserClick,
  onEventActivate,
  onRangeDragStart,
  onRangeDragEnter,
  onRangeDragEnd,
  isRangeSelecting,
}) => {
  const today = isToday(date);
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

  const visibleEvents = events.slice(0, 2);
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
        "group relative flex h-full min-h-[100px] flex-col gap-1 rounded-xl border border-line-subtle bg-surface-sunken p-2 text-foreground transition duration-200 focus-visible:ring-1 focus-visible:ring-ring/60 xl:min-h-[110px] 2xl:min-h-[130px]",
        isPlainCell && "hover:border-border hover:bg-card-raised",
        !isCurrentMonth && "bg-surface-sunken/50 text-muted-foreground/60",
        today && "calendar-today-glow border-info/40",
        isSelected && "border-primary/80 bg-primary/15 dark:bg-primary/[0.12]",
        isRangeStart && "ring-2 ring-inset ring-primary/70 dark:ring-primary/50",
        isRangeEnd && "ring-2 ring-inset ring-primary/70 dark:ring-primary/50",
        isInRange &&
          "border-primary/30 bg-primary/10 dark:border-primary/20 dark:bg-primary/[0.06]",
        isPlainCell &&
          isCurrentMonth &&
          isWeekend(date) &&
          "bg-surface-sunken/70 text-muted-foreground/80",
        isRangeSelecting && "cursor-crosshair"
      )}
    >
      <div className="flex w-full items-center justify-between">
        <span
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold",
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
          <span className="hidden rounded border border-info/20 bg-info/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-blue-700 dark:text-blue-400 sm:inline">
            Today
          </span>
        )}
        {isCurrentMonth && !today && (
          <span
            aria-hidden="true"
            className="pointer-events-none hidden text-[10px] font-semibold text-blue-700 opacity-0 transition-opacity duration-150 group-hover:opacity-100 dark:text-blue-400 md:inline"
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
          >
            <EventCard event={evt} />
          </EventTooltip>
        ))}
      </div>
      {overflowEvents > 0 && (
        <span className="pl-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
          +{overflowEvents} more
        </span>
      )}
    </div>
  );
};
