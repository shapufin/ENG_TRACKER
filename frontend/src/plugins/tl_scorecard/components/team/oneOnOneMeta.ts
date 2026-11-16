import type { Tone } from "@/components/ui/tone";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import type { OneOnOnePlan, OneOnOneStatus } from "../../types/tlScorecard";

export const ONE_ON_ONE_STATUS_LABEL: Record<OneOnOneStatus, string> = {
  upcoming: "Upcoming",
  due: "Due today",
  overdue: "Overdue",
};

export const ONE_ON_ONE_STATUS_TONE: Record<OneOnOneStatus, Tone> = {
  upcoming: "neutral",
  due: "info",
  overdue: "danger",
};

/** "Moved from 18/11/2026 (public holiday)"; null when the slot did not move. */
export const movedNote = (plan: OneOnOnePlan): string | null => {
  if (!plan.moved_from || !plan.moved_reason) return null;
  const why = plan.moved_reason === "holiday" ? "public holiday" : "employee on leave";
  return `Moved from ${formatDateDDMMYYYY(plan.moved_from)} (${why})`;
};

/** Only a slot that is due or overdue can be skipped. */
export const canSkip = (plan: OneOnOnePlan): boolean => plan.status !== "upcoming";
