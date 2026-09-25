import api from "@/lib/api";
import type { EngagementSurveyTeamAverage, KpiCoverageEntry, Scorecard } from "../types/tlScorecard";

const BASE = "/plugins/tl_scorecard";

export const tlScorecardService = {
  getScorecard: (month?: string) => {
    const params: Record<string, string> = {};
    if (month) params.month = month;
    return api.get<Scorecard>(`${BASE}/scorecard/`, { params });
  },

  getKpiCoverage: () => api.get<KpiCoverageEntry[]>(`${BASE}/kpi-coverage/`),

  getEngagementSurveyTeamAverage: (period?: string) => {
    const params: Record<string, string> = {};
    if (period) params.period = period;
    return api.get<EngagementSurveyTeamAverage>(`${BASE}/engagement-survey-responses/team-average/`, { params });
  },

  submitEngagementSurveyResponse: (data: { period: string; score: number }) =>
    api.post(`${BASE}/engagement-survey-responses/`, data),
};
