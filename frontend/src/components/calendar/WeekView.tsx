import React, { useMemo } from "react";
import { format, addDays } from "date-fns";
import { WeekViewHeader } from "./WeekViewHeader";
import { WeekViewDayHeader } from "./WeekViewDayHeader";
import { WeekViewUserRow } from "./WeekViewUserRow";
import { getWeekDays, groupEventsByDay } from "./weekViewUtils";
import type { CalendarEvent } from "./types";
import type { User } from "@/types";
import { calendarSurface } from "./calendarStyles";

interface WeekViewProps {
  currentDate: Date;
  users: User[];
  events: CalendarEvent[];
  onUserClick?: (userId: number) => void;
  onSelectDate?: (date: Date) => void;
  rangeStart?: Date | null;
  rangeEnd?: Date | null;
  onRangeDragStart?: (date: Date) => void;
  onRangeDragEnter?: (date: Date) => void;
  onRangeDragEnd?: (date: Date) => void;
  isRangeSelecting?: boolean;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
}

export const WeekView: React.FC<WeekViewProps> = ({
  currentDate,
  users,
  events,
  onUserClick,
  onSelectDate,
  rangeStart,
  rangeEnd,
  onRangeDragStart,
  onRangeDragEnter,
  onRangeDragEnd,
  isRangeSelecting,
  onPrevWeek,
  onNextWeek,
}) => {
  const weekStart = useMemo(() => getWeekDays(currentDate)[0], [currentDate]);
  const weekEnd = addDays(weekStart, 6);
  const weekDays = getWeekDays(currentDate);
  const groupedEvents = useMemo(() => groupEventsByDay(events, weekDays), [events, weekDays]);

  return (
    <div
      className={`flex h-full min-w-0 flex-col overflow-hidden md:min-w-[900px] ${calendarSurface}`}
    >
      <WeekViewHeader
        weekLabel={`${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d, yyyy")}`}
        onPrevWeek={onPrevWeek}
        onNextWeek={onNextWeek}
      />
      <WeekViewDayHeader days={weekDays} />
      <div className="flex-1 overflow-auto">
        {users.map((user) => (
          <WeekViewUserRow
            key={user.id}
            user={user}
            days={weekDays}
            groupedEvents={groupedEvents}
            onUserClick={onUserClick}
            onSelectDate={onSelectDate}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            onRangeDragStart={onRangeDragStart}
            onRangeDragEnter={onRangeDragEnter}
            onRangeDragEnd={onRangeDragEnd}
            isRangeSelecting={isRangeSelecting}
          />
        ))}
      </div>
    </div>
  );
};
