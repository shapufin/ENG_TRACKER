import { format, parseISO, addDays } from "date-fns";
import type { CalendarEvent } from "@/components/calendar/types";

const forEachLeaveDay = (
  events: CalendarEvent[],
  callback: (key: string, evt: CalendarEvent) => void
) => {
  events
    .filter((evt) => evt.type === "vacation" || evt.type === "sick")
    .forEach((evt) => {
      const start = parseISO(evt.start);
      const end = parseISO(evt.end);
      for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
        const key = format(cursor, "yyyy-MM-dd");
        callback(key, evt);
      }
    });
};

export const buildConflictEntries = (events: CalendarEvent[]) => {
  const perDay = new Map<string, Set<number>>();
  forEachLeaveDay(events, (key, evt) => {
    if (evt.userId) {
      const set = perDay.get(key) ?? new Set<number>();
      set.add(evt.userId);
      perDay.set(key, set);
    }
  });
  return Array.from(perDay.entries())
    .filter(([, members]) => members.size >= 2)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([key, members]) => ({
      date: format(parseISO(key), "PP"),
      description: `${members.size} members on leave`,
    }));
};

export const buildAllConflictEntries = (events: CalendarEvent[]) => {
  const perDay = new Map<
    string,
    Array<{
      id: number;
      name: string;
      type: "vacation" | "sick";
      status: "pending" | "approved" | "rejected";
    }>
  >();
  forEachLeaveDay(events, (key, evt) => {
    if (evt.userId && evt.userName) {
      const users = perDay.get(key) ?? [];
      users.push({
        id: evt.userId,
        name: evt.userName,
        type: evt.type as "vacation" | "sick",
        status: evt.status as "pending" | "approved" | "rejected",
      });
      perDay.set(key, users);
    }
  });
  return Array.from(perDay.entries())
    .filter(([, users]) => users.length >= 2)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, users]) => ({
      date: format(parseISO(key), "PP"),
      description: `${users.length} members on leave`,
      users,
    }));
};
