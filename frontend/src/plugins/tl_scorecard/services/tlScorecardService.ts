import api from "@/lib/api";
import { normalizeList } from "@/lib/api-utils";
import type { PaginatedResponse } from "@/types";
import type {
  Absence,
  ApprovalEngagementScore,
  EngagementSurveyTeamAverage,
  EPRCycle,
  EscalationCandidate,
  KpiCoverageEntry,
  PIPRecord,
  HbprEvidence,
  HbprEvidenceKind,
  HbprEvidencePayload,
  HbprOverview,
  HbprPartnership,
  IdleFlag,
  Meeting,
  PromotionFlag,
  ReviewDelivery,
  Scorecard,
} from "../types/tlScorecard";

const BASE = "/plugins/tl_scorecard";

export type RecordResource =
  | "meetings"
  | "idle-flags"
  | "absences"
  | "review-deliveries"
  | "promotion-flags"
  | "pip-records";

// Lists are paginated (50 a page). The Records tab filters client-side, so it needs
// every row: stopping at page one would silently hide an HBPR's older records.
const MAX_PAGES = 40;

const listAllPages = async <T>(
  path: string,
  params: Record<string, string | number> = {}
): Promise<T[]> => {
  const rows: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data } = await api.get<T[] | PaginatedResponse<T>>(path, {
      params: { ...params, page },
    });
    rows.push(...normalizeList(data));
    if (Array.isArray(data) || !data.next) break;
  }
  return rows;
};

const listResource = <T>(resource: RecordResource): Promise<T[]> =>
  listAllPages<T>(`${BASE}/${resource}/`);

const leaderParams = (leaderId?: number): Record<string, number> =>
  leaderId ? { leader_id: leaderId } : {};

export const tlScorecardService = {
  getScorecard: (month?: string, leaderId?: number) => {
    const params: Record<string, string | number> = leaderParams(leaderId);
    if (month) params.month = month;
    return api.get<Scorecard>(`${BASE}/scorecard/`, { params });
  },

  getKpiCoverage: () => api.get<KpiCoverageEntry[]>(`${BASE}/kpi-coverage/`),

  getTrend: (months = 6) => api.get<Scorecard[]>(`${BASE}/trend/`, { params: { months } }),

  // Hits the engagement plugin's own public REST endpoint directly rather
  // than importing its service module — see ApprovalEngagementScore's
  // comment in types/tlScorecard.ts for why.
  getApprovalEngagementScore: () =>
    api.get<ApprovalEngagementScore>("/plugins/engagement/metrics/summary/"),

  getEngagementSurveyTeamAverage: (period?: string) => {
    const params: Record<string, string> = {};
    if (period) params.period = period;
    return api.get<EngagementSurveyTeamAverage>(
      `${BASE}/engagement-survey-responses/team-average/`,
      { params }
    );
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

  createIdleFlag: (data: {
    employee: number;
    flagged_on: string;
    productivity_task: string;
    notes: string;
  }) => api.post(`${BASE}/idle-flags/`, data),

  createReviewDelivery: (data: { period: string; recipient: string; delivered_on: string }) =>
    api.post(`${BASE}/review-deliveries/`, data),

  getEscalations: (leaderId?: number) =>
    api.get<EscalationCandidate[]>(`${BASE}/escalations/`, { params: leaderParams(leaderId) }),

  createAbsence: (data: {
    employee: number;
    absence_date: string;
    reason: string;
    notes: string;
  }) => api.post(`${BASE}/absences/`, data),

  createPromotionFlag: (data: { employee: number; nominated_on: string; notes: string }) =>
    api.post(`${BASE}/promotion-flags/`, data),

  listPIPRecords: () => listResource<PIPRecord>("pip-records"),
  listMeetings: () => listResource<Meeting>("meetings"),
  listIdleFlags: () => listResource<IdleFlag>("idle-flags"),
  listAbsences: () => listResource<Absence>("absences"),
  listReviewDeliveries: () => listResource<ReviewDelivery>("review-deliveries"),
  listPromotionFlags: () => listResource<PromotionFlag>("promotion-flags"),

  updateRecord: (resource: RecordResource, id: number, data: Record<string, unknown>) =>
    api.patch(`${BASE}/${resource}/${id}/`, data),
  deleteRecord: (resource: RecordResource, id: number) => api.delete(`${BASE}/${resource}/${id}/`),

  shareMeeting: (id: number, summary: string) =>
    api.post(`${BASE}/meetings/${id}/share/`, { summary }),
  resolveIdleFlag: (id: number) => api.post(`${BASE}/idle-flags/${id}/resolve/`),
  addressAbsence: (id: number) => api.post(`${BASE}/absences/${id}/address/`),
  rejectPIPRecord: (id: number, status_note: string) =>
    api.post<PIPRecord>(`${BASE}/pip-records/${id}/reject/`, { status_note }),
  completePIPRecord: (id: number) => api.post<PIPRecord>(`${BASE}/pip-records/${id}/complete/`),
  cancelPIPRecord: (id: number, status_note: string) =>
    api.post<PIPRecord>(`${BASE}/pip-records/${id}/cancel/`, { status_note }),
  decidePromotionFlag: (
    id: number,
    data: { status: "promoted" | "declined"; decision_note: string }
  ) => api.post<PromotionFlag>(`${BASE}/promotion-flags/${id}/decide/`, data),

  createPIPRecord: (data: { employee: number; start_date: string; notes: string }) =>
    // Status is server-controlled: a new plan starts as a draft awaiting HR approval.
    api.post<PIPRecord>(`${BASE}/pip-records/`, data),

  approvePIPRecord: (id: number) => api.post<PIPRecord>(`${BASE}/pip-records/${id}/approve/`),

  listEPRCycles: (): Promise<EPRCycle[]> => listAllPages<EPRCycle>(`${BASE}/epr-cycles/`),

  createEPRCycle: (data: { user: number; year: number }) =>
    api.post<EPRCycle>(`${BASE}/epr-cycles/`, data),

  createEPRGoal: (data: { cycle: number; description: string }) =>
    api.post(`${BASE}/epr-goals/`, data),

  completeEPRStage: (
    cycleId: number,
    field: "goal_setting_completed_at" | "mid_year_completed_at" | "final_review_completed_at"
  ) => api.patch<EPRCycle>(`${BASE}/epr-cycles/${cycleId}/`, { [field]: new Date().toISOString() }),

  getHbprOverview: (year?: number) =>
    api.get<HbprOverview>(`${BASE}/hbpr/overview/`, { params: year ? { year } : undefined }),

  /** Governance evidence for the viewer's assignments (HBPR and the AL TL). */
  listHbprEvidence: (
    params: { year?: number; kind?: HbprEvidenceKind; assignment?: number } = {}
  ) => listAllPages<HbprEvidence>(`${BASE}/hbpr-evidence/`, params),

  /** The AL TL's own HBPR partnership (staff/HBPR must pass a leaderId). */
  getPartnership: (leaderId?: number, year?: number) => {
    const params: Record<string, number> = leaderParams(leaderId);
    if (year) params.year = year;
    return api.get<HbprPartnership>(`${BASE}/partnership/`, { params });
  },

  createHbprEvidence: (data: HbprEvidencePayload) =>
    api.post<HbprEvidence>(`${BASE}/hbpr-evidence/`, data),

  updateHbprEvidence: (id: number, data: Partial<HbprEvidencePayload>) =>
    api.patch<HbprEvidence>(`${BASE}/hbpr-evidence/${id}/`, data),

  exportWorkbook: (month?: string, leaderId?: number) => {
    const params: Record<string, string | number> = leaderParams(leaderId);
    if (month) params.month = month;
    return api.get<Blob>(`${BASE}/export/`, { params, responseType: "blob" });
  },
};
