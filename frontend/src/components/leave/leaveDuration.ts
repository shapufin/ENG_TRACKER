export type LeaveDuration = "full" | "morning" | "afternoon";

export const durationOf = (isHalfDay?: boolean, period?: string | null): LeaveDuration =>
  isHalfDay ? (period === "afternoon" ? "afternoon" : "morning") : "full";

/** Request fields for a duration; a half day always sits on one date. */
export const durationFields = (duration: LeaveDuration) => ({
  is_half_day: duration !== "full",
  half_day_period: duration === "full" ? null : duration,
});
