import React, { useState, useMemo, useEffect } from "react";
import {
  format,
  isValid,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

interface CalendarPanelProps {
  value: string;
  onSelect: (date: Date, isoDate: string) => void;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export const CalendarPanel: React.FC<CalendarPanelProps> = ({ value, onSelect }) => {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const parsed = value ? new Date(value + "T00:00:00") : new Date();
    return isValid(parsed) ? parsed : new Date();
  });

  useEffect(() => {
    if (!value) return;
    const parsed = new Date(value + "T00:00:00");
    if (!isValid(parsed)) return;
    const frame = requestAnimationFrame(() => setCurrentMonth(parsed));
    return () => cancelAnimationFrame(frame);
  }, [value]);

  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });
    const firstDayOfWeek = getDay(start);
    const emptySlots = Array(firstDayOfWeek).fill(null);
    return { emptySlots, days };
  }, [currentMonth]);

  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  const isSelectedDay = (day: Date) => {
    if (!value) return false;
    const selectedDate = new Date(value + "T00:00:00");
    return isSameDay(day, selectedDate);
  };

  const handleDateSelect = (date: Date) => {
    setCurrentMonth(date);
    onSelect(date, format(date, "yyyy-MM-dd"));
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Button type="button" variant="ghost" size="sm" onClick={prevMonth} className="h-7 w-7 p-0">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold">{format(currentMonth, "MMMM yyyy")}</span>
        <Button type="button" variant="ghost" size="sm" onClick={nextMonth} className="h-7 w-7 p-0">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="mb-2 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((day) => (
          <div key={day} className="text-center text-xs font-medium text-muted-foreground">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {calendarDays.emptySlots.map((_, idx) => (
          <div key={`empty-${idx}`} className="h-8 w-8" />
        ))}
        {calendarDays.days.map((day) => {
          const selected = isSelectedDay(day);
          const currentMonthDay = isSameMonth(day, currentMonth);
          const todayDate = isToday(day);

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => handleDateSelect(day)}
              className={cn(
                "h-8 w-8 rounded-sm p-0 text-xs",
                "flex items-center justify-center",
                "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "hover:bg-accent hover:text-accent-foreground",
                !currentMonthDay && "text-muted-foreground/50",
                todayDate && !selected && "border border-primary text-primary"
              )}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </>
  );
};
