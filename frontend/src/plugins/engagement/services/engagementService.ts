import api from "@/lib/api";
import type {
  EngagementSummary,
  EngagementTrendPoint,
  EngagementTeamBreakdownRow,
  EngagementStatus,
} from "../types/engagement";

const BASE = "/plugins/engagement";

const addDefinedParam = (
  query: Record<string, string>,
  key: string,
  value: string | number | undefined
) => {
  if (value !== undefined && value !== "") query[key] = String(value);
};

export const engagementService = {
  getSummary: (month?: string) => {
    const params: Record<string, string> = {};
    addDefinedParam(params, "month", month);
    return api.get<EngagementSummary>(`${BASE}/metrics/summary/`, { params });
  },

  getTrend: (months?: number) => {
    const params: Record<string, string> = {};
    addDefinedParam(params, "months", months);
    return api.get<EngagementTrendPoint[]>(`${BASE}/metrics/trend/`, { params });
  },

  getTeamBreakdown: (month?: string) => {
    const params: Record<string, string> = {};
    addDefinedParam(params, "month", month);
    return api.get<EngagementTeamBreakdownRow[]>(`${BASE}/metrics/team-breakdown/`, { params });
  },

  getStatus: () => api.get<EngagementStatus>(`${BASE}/metrics/status/`),

  exportReport: (month: string, scope: "month" | "year") =>
    api.get<Blob>(`${BASE}/metrics/export/`, {
      params: { month, scope },
      responseType: "blob",
    }),
};
