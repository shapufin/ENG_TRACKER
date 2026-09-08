import type { PendingMonthEntry } from "@/types";

/**
 * Given the list of months with pending items and the currently selected
 * month (derived from dateFrom), return the next month to jump to.
 *
 * Behavior:
 * - If there are no months with pending items, return null (no jump).
 * - Find the first month in the list that is strictly AFTER the current
 *   month. If none exists (current is at or past the last pending month),
 *   wrap around to the first month in the list.
 *
 * @param months - Sorted ascending array of { month, count } entries.
 * @param currentMonth - "YYYY-MM" string of the currently viewed month.
 * @returns "YYYY-MM-DD" (first of month) or null if no months available.
 */
export const getNextPendingMonth = (
  months: PendingMonthEntry[],
  currentMonth: string
): string | null => {
  if (!months.length) return null;

  // Find first month strictly after currentMonth
  const next = months.find((m) => m.month > currentMonth + "-01");
  if (next) return next.month;

  // Wrap around to the first month
  return months[0].month;
};

/**
 * Convert a "YYYY-MM-DD" date string to "YYYY-MM" format.
 */
export const toMonthKey = (dateStr: string): string => dateStr.slice(0, 7);

/**
 * Get the first and last day of a "YYYY-MM-DD" month string.
 * Returns { firstDay, lastDay } as "YYYY-MM-DD" strings.
 * Uses local date formatting to avoid UTC timezone shifts.
 */
export const getMonthRange = (monthIso: string): { firstDay: string; lastDay: string } => {
  const [year, month] = monthIso.split("-").map(Number);
  const firstDay = `${year}-${String(month).padStart(2, "0")}-01`;
  // new Date(year, month, 0) gives the last day of the previous month index,
  // which is the last day of our target month (month is 1-based).
  const lastDayDate = new Date(year, month, 0);
  const lastDay = `${lastDayDate.getFullYear()}-${String(lastDayDate.getMonth() + 1).padStart(2, "0")}-${String(lastDayDate.getDate()).padStart(2, "0")}`;
  return { firstDay, lastDay };
};
