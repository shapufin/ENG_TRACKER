import type { Period } from "@/pages/analytics/hooks/useAnalyticsPage";

export const buildAnalyticsParams = (
  selectedPeriod: Period,
  dateRange: { from: string; to: string },
  selectedTeams: string[],
  selectedUsers: string[],
  selectedStatuses: string[],
  selectedCategories: string[]
) => {
  const params = new URLSearchParams();
  params.append("period", selectedPeriod);
  if (selectedPeriod === "custom") {
    params.append("date_from", dateRange.from);
    params.append("date_to", dateRange.to);
  }
  selectedTeams.forEach((t) => params.append("teams", t));
  selectedUsers.forEach((u) => params.append("users", u));
  selectedStatuses.forEach((s) => params.append("status", s));
  selectedCategories.forEach((c) => params.append("category", c));
  return params;
};
