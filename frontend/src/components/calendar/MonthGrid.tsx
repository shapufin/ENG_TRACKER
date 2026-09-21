import React from "react";
import { format, isSameMonth } from "date-fns";
import { CalendarDayCell } from "./CalendarDayCell";
import { useMonthGrid } from "./hooks/useMonthGrid";
import type { CalendarEvent } from "./types";
import { calendarGridHeader } from "./calendarStyles";

interface MonthGridProps {
  currentMonth: Date;
  events: CalendarEvent[];
  selectedDate?: Date | null;
  rangeStart?: Date | null;
  rangeEnd?: Date | null;
  onSelectDate: (date: Date) => void;
  onUserClick?: (userId: number) => void;
  onEventActivate?: (event: CalendarEvent) => void;
  viewMode?: "month" | "week" | "list";
  onRangeDragStart?: (date: Date) => void;
  onRangeDragEnter?: (date: Date) => void;
  onRangeDragEnd?: (date: Date) => void;
  isRangeSelecting?: boolean;
}

export const MonthGrid: React.FC<MonthGridProps> = ({
  currentMonth,
  events,
  selectedDate,
  rangeStart,
  rangeEnd,
  onSelectDate,
  onUserClick,
  onEventActivate,
  viewMode = "month",
  onRangeDragStart,
  onRangeDragEnter,
  onRangeDragEnd,
  isRangeSelecting,
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
      className="min-w-0 overflow-hidden rounded-xl border border-border/60 bg-card md:min-w-[720px]"
      role="grid"
      aria-label={format(currentMonth, "MMMM yyyy")}
    >
      <div className={`grid grid-cols-7 ${calendarGridHeader}`} role="row">
        {weekDays.map((wd) => (
          <div
            key={wd}
            className="py-2.5 text-center font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground"
          >
            {wd}
          </div>
        ))}
      </div>

      {displayRows.map((week, weekIdx) => (
        <div
          key={weekIdx}
          className="grid grid-cols-7 gap-px border-b border-border/50 bg-border/50 last:border-b-0"
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
                onSelect={onSelectDate}
                onUserClick={onUserClick}
                onEventActivate={onEventActivate}
                onRangeDragStart={onRangeDragStart}
                onRangeDragEnter={onRangeDragEnter}
                onRangeDragEnd={onRangeDragEnd}
                isRangeSelecting={isRangeSelecting}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
};
