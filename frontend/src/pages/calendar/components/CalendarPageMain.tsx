import React from "react";
import { addWeeks, subWeeks } from "date-fns";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { WeekView } from "@/components/calendar/WeekView";
import { ListView } from "@/components/calendar/ListView";
import { TimelineView } from "@/components/calendar/TimelineView";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { useCalendarPageData } from "../hooks/useCalendarPageData";
import { calendarSurface } from "@/components/calendar/calendarStyles";
import { cn } from "@/lib/utils";

type CalendarData = ReturnType<typeof useCalendarPageData>;

interface CalendarPageMainProps {
  data: CalendarData;
}

export const CalendarPageMain: React.FC<CalendarPageMainProps> = ({ data }) => {
  const handlePrevWeek = () => data.setCurrentMonth((prev: Date) => subWeeks(prev, 1));
  const handleNextWeek = () => data.setCurrentMonth((prev: Date) => addWeeks(prev, 1));

  return (
    <div className={`relative flex min-h-0 flex-1 flex-col overflow-hidden ${calendarSurface}`}>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden p-1.5">
        <div
          className={cn(
            "flex h-full min-h-0 flex-col",
            // A month must fit the viewport; the other views can be taller than
            // the frame, so they scroll inside it.
            data.viewMode === "month" ? "overflow-hidden" : "overflow-x-auto overflow-y-auto pr-1"
          )}
        >
          <TooltipProvider delayDuration={0}>
            {data.viewMode === "month" && (
              <MonthGrid
                currentMonth={data.currentMonth}
                events={data.events}
                selectedDate={data.selectedDate}
                rangeStart={data.rangeStart}
                rangeEnd={data.rangeEnd}
                density={data.density}
                onSelectDate={data.handleSelectDate}
                onShowDayEvents={data.openDayEvents}
                onUserClick={data.handleUserClick}
                onEventActivate={data.handleEventActivate}
                viewMode={data.viewMode}
                onRangeDragStart={data.handleRangeStart}
                onRangeDragEnter={data.handleRangeMove}
                onRangeDragEnd={data.finalizeRangeSelection}
                isRangeSelecting={data.isDraggingRange}
                conflictsByDate={data.dayConflicts}
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
                onEventActivate={data.handleEventActivate}
                conflictsByDate={data.dayConflicts}
              />
            )}
            {data.viewMode === "timeline" && (
              <TimelineView
                currentMonth={data.currentMonth}
                users={data.allUsers}
                events={data.events}
                onUserClick={data.handleUserClick}
                onEventActivate={data.handleEventActivate}
                onRequestTimeOff={data.openBookingDialog}
                onSelectDate={data.handleSelectDate}
                conflictsByDate={data.dayConflicts}
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
