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

  createMeeting: (data: {
    meeting_type: string;
    counterparty: number | null;
    team: number | null;
    occurred_on: string;
    notes: string;
  }) => api.post(`${BASE}/meetings/`, data),

  createIdleFlag: (data: { employee: number; flagged_on: string; productivity_task: string; notes: string }) =>
    api.post(`${BASE}/idle-flags/`, data),

  createReviewDelivery: (data: { period: string; recipient: string; delivered_on: string }) =>
    api.post(`${BASE}/review-deliveries/`, data),
};
