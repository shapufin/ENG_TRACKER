export interface HbprPersonRef {
  id: number;
  name: string;
}

export type HbprCadence = "weekly" | "biweekly" | "monthly";

export type HbprCadenceStatus = "not_started" | "on_track" | "due" | "overdue" | "ended";

/**
 * An explicit, dated HBPR ↔ Albanian TL assignment. One open row per Albanian
 * TL; history is retained via `effective_to`.
 */
export interface HbprAssignment {
  id: number;
  hbpr: number;
  albanian_tl: number;
  hbpr_detail: HbprPersonRef;
  albanian_tl_detail: HbprPersonRef;
  cadence: HbprCadence;
  cadence_display?: string;
  cadence_day_of_week?: number | null;
  cadence_nth_week?: number | null;
  effective_from: string;
  effective_to: string | null;
  is_current: boolean;
  last_meeting_on: string | null;
  next_due_on: string | null;
  cadence_status: HbprCadenceStatus;
  evidence_count: number;
}

export interface HbprAssignmentPayload {
  hbpr: number;
  albanian_tl: number;
  cadence: HbprCadence;
  cadence_day_of_week?: number | null;
  cadence_nth_week?: number | null;
  effective_from: string;
}

export interface HbprUpdateAssignmentPayload {
  cadence?: HbprCadence;
  cadence_day_of_week?: number | null;
  cadence_nth_week?: number | null;
  effective_from?: string;
}

export interface HbprReassignPayload {
  new_hbpr: number;
  cadence: HbprCadence;
  cadence_day_of_week?: number | null;
  cadence_nth_week?: number | null;
  effective_from: string;
}

export const CADENCE_LABELS: Record<HbprCadence, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
};

export const WEEKDAY_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 0, label: "Monday" },
  { value: 1, label: "Tuesday" },
  { value: 2, label: "Wednesday" },
  { value: 3, label: "Thursday" },
  { value: 4, label: "Friday" },
  { value: 5, label: "Saturday" },
  { value: 6, label: "Sunday" },
];

export const NTH_WEEK_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 1, label: "1st" },
  { value: 2, label: "2nd" },
  { value: 3, label: "3rd" },
  { value: 4, label: "4th" },
  { value: -1, label: "Last" },
];

export const CADENCE_STATUS_LABELS: Record<HbprCadenceStatus, string> = {
  not_started: "Not started",
  on_track: "On track",
  due: "Due",
  overdue: "Overdue",
  ended: "Ended",
};

/**
 * Calculates the exact calendar date (YYYY-MM-DD) for the Nth weekday of a month.
 * nth: 1=1st, 2=2nd, 3=3rd, 4=4th, -1=Last.
 * weekday: 0=Monday ... 6=Sunday.
 */
export function getNthWeekdayOfMonth(
  year: number,
  month: number,
  nth: number,
  weekday: number
): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (nth === -1) {
    const lastDayDate = new Date(Date.UTC(year, month, 0));
    const lastDay = lastDayDate.getUTCDate();
    const jsDay = lastDayDate.getUTCDay();
    const curWeekday = jsDay === 0 ? 6 : jsDay - 1;
    const offset = (curWeekday - weekday + 7) % 7;
    const targetDay = lastDay - offset;
    return `${year}-${pad(month)}-${pad(targetDay)}`;
  }

  const firstDayDate = new Date(Date.UTC(year, month - 1, 1));
  const jsDay = firstDayDate.getUTCDay();
  const curWeekday = jsDay === 0 ? 6 : jsDay - 1;
  const offset = (weekday - curWeekday + 7) % 7;
  const firstOccurrence = 1 + offset;
  const targetDay = firstOccurrence + (nth - 1) * 7;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const clampedDay = targetDay > lastDay ? targetDay - 7 : targetDay;
  return `${year}-${pad(month)}-${pad(clampedDay)}`;
}

/**
 * Calculates the upcoming occurrence of a cadence schedule based on an anchor date.
 */
export function calculateNextCadenceOccurrence({
  cadence,
  cadenceDayOfWeek,
  cadenceNthWeek,
  anchorDate,
}: {
  cadence: HbprCadence;
  cadenceDayOfWeek: number | null | undefined;
  cadenceNthWeek: number | null | undefined;
  anchorDate: string;
}): string {
  const [yStr, mStr, dStr] = anchorDate.split("-");
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10);
  const day = parseInt(dStr, 10);
  const pad = (n: number) => String(n).padStart(2, "0");

  if (cadence === "weekly" || cadence === "biweekly") {
    if (cadenceDayOfWeek === null || cadenceDayOfWeek === undefined) {
      const step = cadence === "weekly" ? 7 : 14;
      const d = new Date(Date.UTC(year, month - 1, day + step));
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
    const curDate = new Date(Date.UTC(year, month - 1, day));
    const jsDay = curDate.getUTCDay();
    const curWeekday = jsDay === 0 ? 6 : jsDay - 1;
    const offset = (cadenceDayOfWeek - curWeekday + 7) % 7;
    const nextDate = new Date(Date.UTC(year, month - 1, day + offset));
    return `${nextDate.getUTCFullYear()}-${pad(nextDate.getUTCMonth() + 1)}-${pad(nextDate.getUTCDate())}`;
  }

  // Monthly
  if (
    cadenceNthWeek !== null &&
    cadenceNthWeek !== undefined &&
    cadenceDayOfWeek !== null &&
    cadenceDayOfWeek !== undefined
  ) {
    const candidate = getNthWeekdayOfMonth(year, month, cadenceNthWeek, cadenceDayOfWeek);
    if (candidate >= anchorDate) {
      return candidate;
    }
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    return getNthWeekdayOfMonth(nextYear, nextMonth, cadenceNthWeek, cadenceDayOfWeek);
  }

  // Standard monthly day-of-month clamped
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const maxDayNextMonth = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  const clampedDay = Math.min(day, maxDayNextMonth);
  return `${nextYear}-${pad(nextMonth)}-${pad(clampedDay)}`;
}
