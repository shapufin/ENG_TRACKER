import { useMemo, useCallback } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  format,
  isSameMonth,
  getISOWeek,
} from "date-fns";
import type { CalendarEvent } from "../types";

const parseISOToLocal = (dateStr: string) => {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
};

interface UseMonthGridOptions {
  currentMonth: Date;
  events: CalendarEvent[];
  viewMode?: "month" | "week" | "list";
}

export const useMonthGrid = ({ currentMonth, events, viewMode = "month" }: UseMonthGridOptions) => {
  const monthStart = startOfMonth(currentMonth);
  const monthSignature = currentMonth.getTime();

  // fallow-ignore-next-line complexity
  const rows = useMemo(() => {
    const result: Date[][] = [];
    let days: Date[] = [];
    const base = new Date(monthSignature);
    const visibleStart = startOfWeek(viewMode === "week" ? base : startOfMonth(base), {
      weekStartsOn: 1,
    });
    const visibleEnd = endOfWeek(viewMode === "week" ? base : endOfMonth(base), {
      weekStartsOn: 1,
    });
    const startMs = visibleStart.getTime();
    const endMs = visibleEnd.getTime();
    const DAY_MS = 24 * 60 * 60 * 1000;
    for (let time = startMs; time <= endMs; time += DAY_MS) {
      days.push(new Date(time));
      if (days.length === 7) {
        result.push(days);
        days = [];
      }
    }
    if (days.length) result.push(days);
    return result;
  }, [monthSignature, viewMode]);

  const eventMap = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((evt) => {
      const start = parseISOToLocal(evt.start);
      const end = parseISOToLocal(evt.end);
      for (let d = start; d <= end; d = addDays(d, 1)) {
        const key = format(d, "yyyy-MM-dd");
        const list = map.get(key) ?? [];
        list.push(evt);
        map.set(key, list);
      }
    });
    return map;
  }, [events]);

  const getDayEvents = useCallback(
    (date: Date) => eventMap.get(format(date, "yyyy-MM-dd")) ?? [],
    [eventMap]
  );

  const displayRows = useMemo(() => {
    if (viewMode !== "week") return rows;
    return rows
      .filter((week) =>
        week.some(
          (d) => isSameMonth(d, monthStart) && d >= currentMonth && d < addDays(currentMonth, 7)
        )
      )
      .slice(0, 1);
  }, [rows, viewMode, monthStart, currentMonth]);

  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const getWeekNumber = (week: Date[]) => getISOWeek(week[0]);

  return { monthStart, displayRows, weekDays, getWeekNumber, getDayEvents };
};
