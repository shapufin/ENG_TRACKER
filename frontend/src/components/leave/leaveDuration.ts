export type LeaveDuration = "full" | "morning" | "afternoon";

/** Day count for a table cell; a half day names its period, e.g. "0.5 (AM)". */
export const leaveDaysLabel = (r: {
  days_requested: number;
  is_half_day?: boolean;
  half_day_period?: string | null;
}) =>
  r.is_half_day
    ? `${r.days_requested} (${r.half_day_period === "afternoon" ? "PM" : "AM"})`
    : String(r.days_requested);

export const durationOf = (isHalfDay?: boolean, period?: string | null): LeaveDuration =>
  isHalfDay ? (period === "afternoon" ? "afternoon" : "morning") : "full";

/** Request fields for a duration; a half day always sits on one date. */
export const durationFields = (duration: LeaveDuration) => ({
  is_half_day: duration !== "full",
  half_day_period: duration === "full" ? null : duration,
});
