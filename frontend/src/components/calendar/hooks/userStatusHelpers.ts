import { differenceInCalendarDays, format, parseISO } from "date-fns";
import type { CalendarEvent } from "../types";

export const computeProgress = (value: number, total: number) =>
  total > 0 ? Math.min(100, (value / total) * 100) : 0;

/**
 * Compact day count for dense UI: whole days render without decimals
 * ("8 d"), fractional days keep at most one decimal ("8.5 d").
 */
export const formatCompactDays = (value: number): string => {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 10) / 10);
};

export const computeCarryOverProgress = (
  carryOverDetail?: { totalDays: number; effectiveAvailableDays?: number } | null
) => {
  if (!carryOverDetail || carryOverDetail.totalDays <= 0) return 0;
  return Math.min(
    100,
    ((carryOverDetail.effectiveAvailableDays ?? 0) / carryOverDetail.totalDays) * 100
  );
};

/** One leave run: adjacent requests of the same type and status collapsed into one row. */
export interface LeaveHistoryEntry {
  id: string;
  type: "vacation" | "sick";
  status: CalendarEvent["status"];
  start: string;
  end: string;
  /** Sum of the merged requests' recorded days; null when the feed carries none. */
  days: number | null;
  /** De-duplicated request reasons, in date order. */
  notes: string[];
  /** How many requests this row represents. */
  requests: number;
}

const LEAVE_TYPES: ReadonlySet<CalendarEvent["type"]> = new Set(["vacation", "sick"]);

const parseDay = (value: string) => {
  const date = parseISO(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Leave History shows vacation and sick leave only — standby shifts are not
 * leave (they live on the calendar and in the standby log) and public holidays
 * are not the member's own absence. Adjacent runs (next request starts the day
 * after the previous one ends) collapse into a single range so a week of
 * five one-day entries reads as one row, newest first.
 */
export const groupLeaveHistory = (events: CalendarEvent[] = []): LeaveHistoryEntry[] => {
  const leaves = events
    .filter((event) => LEAVE_TYPES.has(event.type))
    .map((event) => ({ event, start: parseDay(event.start), end: parseDay(event.end) }))
    .filter(
      (row): row is { event: CalendarEvent; start: Date; end: Date } =>
        row.start !== null && row.end !== null
    )
    .sort((a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime());

  const runs: LeaveHistoryEntry[] = [];

  for (const { event, start, end } of leaves) {
    const last = runs[runs.length - 1];
    const lastEnd = last ? parseDay(last.end) : null;
    const isSameRun =
      last !== undefined &&
      lastEnd !== null &&
      last.type === event.type &&
      last.status === event.status &&
      differenceInCalendarDays(start, lastEnd) <= 1;

    const note = event.description?.trim();
    if (isSameRun && last && lastEnd) {
      if (end > lastEnd) last.end = event.end;
      if (typeof event.days === "number") last.days = (last.days ?? 0) + event.days;
      if (note && !last.notes.includes(note)) last.notes.push(note);
      last.requests += 1;
      continue;
    }

    runs.push({
      id: event.id,
      type: event.type as "vacation" | "sick",
      status: event.status,
      start: event.start,
      end: event.end,
      days: typeof event.days === "number" ? event.days : null,
      notes: note ? [note] : [],
      requests: 1,
    });
  }

  return runs.reverse();
};

/**
 * Compact calendar range: "Nov 10 – 12, 2026", "Nov 28 – Dec 2, 2026" and
 * "Dec 30, 2026 – Jan 2, 2027" — one line at 320px.
 */
export const formatLeaveRange = (startValue: string, endValue: string): string => {
  const start = parseDay(startValue);
  const end = parseDay(endValue);
  if (!start || !end) return startValue === endValue ? startValue : `${startValue} – ${endValue}`;

  if (startValue === endValue) return format(start, "MMM d, yyyy");
  if (start.getFullYear() === end.getFullYear()) {
    if (start.getMonth() === end.getMonth()) {
      return `${format(start, "MMM d")} – ${format(end, "d, yyyy")}`;
    }
    return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
  }
  return `${format(start, "MMM d, yyyy")} – ${format(end, "MMM d, yyyy")}`;
};
