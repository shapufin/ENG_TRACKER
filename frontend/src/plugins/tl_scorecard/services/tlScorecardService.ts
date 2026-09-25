import api from "@/lib/api";
import { normalizeList } from "@/lib/api-utils";
import type { PaginatedResponse } from "@/types";
import type {
  EngagementSurveyTeamAverage,
  EPRCycle,
  EscalationCandidate,
  KpiCoverageEntry,
  PIPRecord,
  Scorecard,
} from "../types/tlScorecard";

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

  getEscalations: () => api.get<EscalationCandidate[]>(`${BASE}/escalations/`),

  createAbsence: (data: { employee: number; absence_date: string; reason: string; notes: string }) =>
    api.post(`${BASE}/absences/`, data),

  createPromotionFlag: (data: { employee: number; nominated_on: string; notes: string }) =>
    api.post(`${BASE}/promotion-flags/`, data),

  async listPIPRecords(): Promise<PIPRecord[]> {
    const { data } = await api.get<PIPRecord[] | PaginatedResponse<PIPRecord>>(`${BASE}/pip-records/`);
    return normalizeList(data);
  },

  createPIPRecord: (data: { employee: number; start_date: string; notes: string }) =>
    api.post<PIPRecord>(`${BASE}/pip-records/`, { ...data, status: "active" }),

  approvePIPRecord: (id: number) => api.post<PIPRecord>(`${BASE}/pip-records/${id}/approve/`),

  async listEPRCycles(): Promise<EPRCycle[]> {
    const { data } = await api.get<EPRCycle[] | PaginatedResponse<EPRCycle>>(`${BASE}/epr-cycles/`);
    return normalizeList(data);
  },

  createEPRCycle: (data: { user: number; year: number }) =>
    api.post<EPRCycle>(`${BASE}/epr-cycles/`, data),

  createEPRGoal: (data: { cycle: number; description: string }) =>
    api.post(`${BASE}/epr-goals/`, data),

  completeEPRStage: (cycleId: number, field: "goal_setting_completed_at" | "mid_year_completed_at" | "final_review_completed_at") =>
    api.patch<EPRCycle>(`${BASE}/epr-cycles/${cycleId}/`, { [field]: new Date().toISOString() }),
};
