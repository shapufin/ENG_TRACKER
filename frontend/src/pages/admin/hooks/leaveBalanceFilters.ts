import type { LeaveBalance } from "@/types";

/** Mirrors CARRYOVER_WARNING_DAYS in apps/dashboard/admin_overview.py so the dashboard card and this filter agree. */
export const CARRYOVER_WINDOW_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS);

/** A carry-over balance with days left that expires between today and `windowDays` from today (inclusive). */
export const isExpiringSoon = (
  b: LeaveBalance,
  today: Date,
  windowDays = CARRYOVER_WINDOW_DAYS
): boolean => {
  if (!b.is_carry_over || !b.expires_at || !(b.available_days > 0)) return false;
  const expires = dayNumber(b.expires_at);
  if (Number.isNaN(expires)) return false;
  const now = dayNumber(today.toISOString());
  return expires >= now && expires <= now + windowDays;
};
