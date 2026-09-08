import React from "react";
import { addWeeks, subWeeks } from "date-fns";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { WeekView } from "@/components/calendar/WeekView";
import { ListView } from "@/components/calendar/ListView";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { useCalendarPageData } from "../hooks/useCalendarPageData";
import { calendarSurface } from "@/components/calendar/calendarStyles";

type CalendarData = ReturnType<typeof useCalendarPageData>;

interface CalendarPageMainProps {
  data: CalendarData;
}

export const CalendarPageMain: React.FC<CalendarPageMainProps> = ({ data }) => {
  const handlePrevWeek = () => data.setCurrentMonth((prev: Date) => subWeeks(prev, 1));
  const handleNextWeek = () => data.setCurrentMonth((prev: Date) => addWeeks(prev, 1));

  return (
    <div
      className={`relative flex min-h-0 flex-[1_0_auto] flex-col overflow-hidden ${calendarSurface}`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-foreground/[0.03] to-transparent" />
      <div className="relative flex-1 overflow-hidden px-4 pb-3.5 pt-5">
        <div className="h-full overflow-x-auto overflow-y-auto pr-1">
          <TooltipProvider delayDuration={0}>
            {data.viewMode === "month" && (
              <MonthGrid
                currentMonth={data.currentMonth}
                events={data.events}
                selectedDate={data.selectedDate}
                rangeStart={data.rangeStart}
                rangeEnd={data.rangeEnd}
                onSelectDate={data.handleSelectDate}
                onUserClick={data.handleUserClick}
                onEventActivate={data.handleEventActivate}
                viewMode={data.viewMode}
                onRangeDragStart={data.handleRangeStart}
                onRangeDragEnter={data.handleRangeMove}
                onRangeDragEnd={data.finalizeRangeSelection}
                isRangeSelecting={data.isDraggingRange}
              />
            )}
            {data.viewMode === "week" && (
              <WeekView
                currentDate={data.currentMonth}
                users={data.allUsers}
                events={data.events}
                onUserClick={data.handleUserClick}
                onSelectDate={data.handleSelectDate}
                rangeStart={data.rangeStart}
                rangeEnd={data.rangeEnd}
                onRangeDragStart={data.handleRangeStart}
                onRangeDragEnter={data.handleRangeMove}
                onRangeDragEnd={data.finalizeRangeSelection}
                isRangeSelecting={data.isDraggingRange}
                onPrevWeek={handlePrevWeek}
                onNextWeek={handleNextWeek}
              />
            )}
            {data.viewMode === "list" && (
              <ListView
                events={data.events}
                users={data.allUsers}
                onUserClick={data.handleUserClick}
              />
            )}
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
};
