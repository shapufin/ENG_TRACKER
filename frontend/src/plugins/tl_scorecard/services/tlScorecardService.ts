import api from "@/lib/api";
import type { KpiCoverageEntry, Scorecard } from "../types/tlScorecard";

const BASE = "/plugins/tl_scorecard";

export const tlScorecardService = {
  getScorecard: (month?: string) => {
    const params: Record<string, string> = {};
    if (month) params.month = month;
    return api.get<Scorecard>(`${BASE}/scorecard/`, { params });
  },

  getKpiCoverage: () => api.get<KpiCoverageEntry[]>(`${BASE}/kpi-coverage/`),
};
