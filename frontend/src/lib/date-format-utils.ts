/**
 * Date formatting utilities.
 */
import { isValid } from "date-fns";

/**
 * Convert a Date to a "YYYY-MM-DD" string using LOCAL time (not UTC).
 *
 * `date.toISOString().split("T")[0]` converts to UTC first, which shifts
 * the date back one day in negative UTC offsets and forward in positive
 * offsets (e.g. UTC+2 renders July 1 local as June 30). This helper
 * formats the local date components directly, avoiding the conversion.
 *
 * Use this anywhere a "today" or "month start/end" ISO date is needed
 * for API queries or display.
 */
export function toLocalISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse a "YYYY-MM-DD" string as a LOCAL date (midnight in the browser's
 * timezone), not UTC. `new Date("2026-07-01")` parses as UTC midnight;
 * this avoids the off-by-one in non-UTC timezones.
 */
export function parseLocalDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Given a "YYYY-MM-DD" start date, return the last day of that same month
 * as a "YYYY-MM-DD" string. Used for auto-populating the "To" date when
 * the user selects a "From" date in date-range filters.
 *
 * Example: "2026-01-15" → "2026-01-31"
 */
export function getMonthEndISO(startDateISO: string): string | null {
  if (!startDateISO) return null;
  const d = parseLocalDate(startDateISO);
  if (!d || isNaN(d.getTime())) return null;
  // new Date(year, month + 1, 0) gives the last day of `month`
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return toLocalISODate(lastDay);
}

export function formatDateDDMMYYYY(dateStr: string | Date | null): string {
  if (!dateStr) return "";
  const d = typeof dateStr === "string" ? new Date(dateStr + "T00:00:00") : dateStr;
  if (isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatDateTime(date: Date | string | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  const datePart = formatDateDDMMYYYY(d);
  const timePart = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${datePart} ${timePart}`;
}

export function parseDDMMYYYYDate(input: string): Date | null {
  if (!input) return null;
  const parts = input.split("/");
  if (parts.length !== 3) return null;

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);

  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  if (year < 1000 || year > 9999) return null;

  const date = new Date(year, month - 1, day);
  if (isValid(date) && date.getDate() === day && date.getMonth() === month - 1) {
    return date;
  }
  return null;
}

/**
 * Return true if the given "YYYY-MM-DD" date string is in a strictly past
 * month relative to today (year/month comparison, day is irrelevant).
 *
 * Used by the monthly edit/delete lock on overtime and standby records:
 * a record dated Jan 15 is editable until Jan 31, then locked on Feb 1.
 * Returns false for empty/invalid input so callers can treat malformed
 * dates as unlocked (the backend enforces the authoritative rule).
 */
export function isPastMonth(isoDate: string | null | undefined): boolean {
  if (!isoDate) return false;
  const d = parseLocalDate(isoDate);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() < now.getFullYear() ||
    (d.getFullYear() === now.getFullYear() && d.getMonth() < now.getMonth())
  );
}
