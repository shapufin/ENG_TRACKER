import type { OvertimeLog, StandbyLog } from "@/types";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface WeeklyHoursPoint {
  day: string;
  overtime: number;
  standby: number;
}

/**
 * Aggregates the last 7 days (today included) of overtime/standby hours by
 * weekday. A rolling window, not the calendar Mon-Sun week: real logs tend to
 * cluster a few days before "today", and a calendar-week cutoff would hide
 * them the moment today crosses into a new week.
 */
export const buildWeeklyHoursChartData = (
  overtimeLogs: Pick<OvertimeLog, "date" | "hours">[],
  standbyLogs: Pick<StandbyLog, "date" | "hours">[],
  now: Date = new Date()
): WeeklyHoursPoint[] => {
  const toDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - 6);

  // Index by calendar-date string (not millisecond arithmetic), so a DST
  // transition inside the window can't skew a day into the wrong bucket.
  const dateKeyToIndex = new Map<string, number>();
  const points = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(windowStart);
    date.setDate(date.getDate() + offset);
    dateKeyToIndex.set(toDateKey(date), offset);
    return { day: WEEKDAY_LABELS[date.getDay()], overtime: 0, standby: 0 };
  });

  // Standby log hours arrive as Decimal strings ("2.00") while overtime
  // log hours arrive as ints — coerce both so += sums instead of
  // concatenating ("02.00", which also poisons the hasWeeklyData check).
  overtimeLogs.forEach((log) => {
    const index = dateKeyToIndex.get(log.date);
    if (index !== undefined) points[index].overtime += Number(log.hours) || 0;
  });
  standbyLogs.forEach((log) => {
    const index = dateKeyToIndex.get(log.date);
    if (index !== undefined) points[index].standby += Number(log.hours) || 0;
  });

  return points;
};
