import type { EPRStage, TeamMemberSummary } from "../../types/tlScorecard";

const ALL_FORMAT = new Intl.NumberFormat("sq-AL", {
  style: "currency",
  currency: "ALL",
  maximumFractionDigits: 0,
});

/** Lek amount for a DRF decimal string, or null when there is no wage to show. */
export const formatWage = (gross: string | null): string | null => {
  if (gross === null) return null;
  const amount = Number(gross);
  return Number.isFinite(amount) ? ALL_FORMAT.format(amount) : null;
};

/** Why the wage cell is a dash: the reason is the tooltip and the screen-reader text. */
export const wageUnavailableReason = (
  status: TeamMemberSummary["wage"]["status"]
): string | null => {
  if (status === "missing") return "No wage for this month";
  if (status === "unavailable") return "Payroll is not available";
  return null;
};

export const EPR_STEPS: { stage: EPRStage; label: string }[] = [
  { stage: "goal_setting", label: "Goal setting" },
  { stage: "mid_year", label: "Mid-year" },
  { stage: "final_review", label: "Final review" },
];

export const eprStageDone = (epr: TeamMemberSummary["epr"], stage: EPRStage): boolean => {
  if (stage === "goal_setting") return epr.goal_setting_done;
  if (stage === "mid_year") return epr.mid_year_done;
  return epr.final_review_done;
};

const LEAVE_TYPE_LABELS: Record<string, string> = {
  vacation: "Vacation",
  sick: "Sick leave",
};

export const leaveTypeLabel = (requestType: string): string =>
  LEAVE_TYPE_LABELS[requestType] ?? requestType;

export const SENIORITY_LABELS: Record<string, string> = {
  junior: "Junior",
  mid: "Mid",
  senior: "Senior",
};
