/* eslint-disable @typescript-eslint/no-explicit-any */
import { format, startOfWeek, addDays } from "date-fns";
import type { CalendarEvent } from "./types";
import { calendarEventTypeStyles } from "./calendarStyles";

export const parseISOToLocal = (dateStr: string) => {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export const getWeekDays = (currentDate: Date) => {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  return Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
};

export const groupEventsByDay = (events: CalendarEvent[], weekDays: Date[]) => {
  const map: Record<string, CalendarEvent[]> = {};
  events.forEach((event) => {
    const start = parseISOToLocal(event.start);
    const end = parseISOToLocal(event.end);
    weekDays.forEach((day) => {
      if (day >= start && day <= end) {
        const key = `${event.userId}-${format(day, "yyyy-MM-dd")}`;
        if (!map[key]) map[key] = [];
        map[key].push(event);
      }
    });
  });
  return map;
};

export const eventColors: Record<CalendarEvent["type"], string> = Object.fromEntries(
  Object.entries(calendarEventTypeStyles).map(([type, styles]) => [
    type,
    `${styles.surface} ${styles.title}`,
  ])
) as Record<CalendarEvent["type"], string>;

// fallow-ignore-next-line complexity
export const userDisplayName = (user: any) =>
  user.full_name || `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || user.username;
