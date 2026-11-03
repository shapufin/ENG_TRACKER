import React from "react";
import { format, isSameMonth } from "date-fns";
import { CalendarDayCell } from "./CalendarDayCell";
import { useMonthGrid } from "./hooks/useMonthGrid";
import type { CalendarDensity, CalendarEvent } from "./types";
import type { DayConflict } from "@/lib/calendarCoverage";
import { calendarGridHeader } from "./calendarStyles";

interface MonthGridProps {
  currentMonth: Date;
  events: CalendarEvent[];
  selectedDate?: Date | null;
  rangeStart?: Date | null;
  rangeEnd?: Date | null;
  density?: CalendarDensity;
  onSelectDate: (date: Date) => void;
  onShowDayEvents?: (date: Date) => void;
  onUserClick?: (userId: number) => void;
  onEventActivate?: (event: CalendarEvent) => void;
  viewMode?: "month" | "week" | "list";
  onRangeDragStart?: (date: Date) => void;
  onRangeDragEnter?: (date: Date) => void;
  onRangeDragEnd?: (date: Date) => void;
  isRangeSelecting?: boolean;
  conflictsByDate?: ReadonlyMap<string, DayConflict>;
}

export const MonthGrid: React.FC<MonthGridProps> = ({
  currentMonth,
  events,
  selectedDate,
  rangeStart,
  rangeEnd,
  density,
  onSelectDate,
  onShowDayEvents,
  onUserClick,
  onEventActivate,
  viewMode = "month",
  onRangeDragStart,
  onRangeDragEnter,
  onRangeDragEnd,
  isRangeSelecting,
  conflictsByDate,
}) => {
  const { monthStart, displayRows, weekDays, getDayEvents } = useMonthGrid({
    currentMonth,
    events,
    viewMode,
  });

  const selectedKey = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const rangeStartKey = rangeStart ? format(rangeStart, "yyyy-MM-dd") : null;
  const rangeEndKey = rangeEnd ? format(rangeEnd, "yyyy-MM-dd") : null;

  return (
    <div
      className="bg-card flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      role="grid"
      aria-label={format(currentMonth, "MMMM yyyy")}
    >
      <div className={`grid shrink-0 grid-cols-7 ${calendarGridHeader}`} role="row">
        {weekDays.map((wd) => (
          <div
            key={wd}
            className="text-muted-foreground py-2 text-center font-mono text-xs font-bold tracking-[0.3em] uppercase"
          >
            {wd}
          </div>
        ))}
      </div>

      <div className="divide-border/50 flex min-h-0 flex-1 flex-col divide-y">
        {displayRows.map((week, weekIdx) => (
          <div
            key={weekIdx}
            className="border-border/50 bg-border/50 grid flex-1 grid-cols-7 gap-px"
            role="row"
          >
            {week.map((date, dayIdx) => {
              const dayKey = format(date, "yyyy-MM-dd");
              const dayEvents = getDayEvents(date);
              const isSelected = selectedKey === dayKey;
              const isRangeStart = rangeStartKey === dayKey;
              const isRangeEnd = rangeEndKey === dayKey;
              const isInRange = !!(
                rangeStartKey &&
                rangeEndKey &&
                dayKey > rangeStartKey &&
                dayKey < rangeEndKey
              );

              return (
                <CalendarDayCell
                  key={dayIdx}
                  date={date}
                  events={dayEvents}
                  isCurrentMonth={isSameMonth(date, monthStart)}
                  isSelected={isSelected}
                  isRangeStart={isRangeStart}
                  isRangeEnd={isRangeEnd}
                  isInRange={isInRange}
                  density={density}
                  onSelect={onSelectDate}
                  onShowDayEvents={onShowDayEvents}
                  onUserClick={onUserClick}
                  onEventActivate={onEventActivate}
                  onRangeDragStart={onRangeDragStart}
                  onRangeDragEnter={onRangeDragEnter}
                  onRangeDragEnd={onRangeDragEnd}
                  isRangeSelecting={isRangeSelecting}
                  conflict={conflictsByDate?.get(format(date, "yyyy-MM-dd"))}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
