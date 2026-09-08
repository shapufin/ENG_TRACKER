/** Admin API service for the Organigrama custom chart builder. */
import api from "@/lib/api";
import { extractResponseResults } from "@/lib/api-utils";
import type {
  OrgChart,
  OrgChartNode,
  OrgChartEdge,
  DraftPayload,
  ValidationResult,
  RoleMini,
  GroupMini,
  UpdateChartPayload,
  OrgChartRevision,
} from "../types";

const BASE = "/plugins/organigrama/charts";

interface CreateChartPayload {
  name: string;
  description?: string;
}

interface SaveDraftPayload {
  revision_number: number;
  nodes: OrgChartNode[];
  edges: OrgChartEdge[];
}

interface PublishPayload {
  change_summary?: string;
}

export const organigramaAdminService = {
  async getCharts(params?: Record<string, unknown>): Promise<OrgChart[]> {
    const { data } = await api.get(BASE + "/", { params });
    return extractResponseResults({ data });
  },

  async getChart(id: number): Promise<OrgChart> {
    const { data } = await api.get(`${BASE}/${id}/`);
    return data;
  },

  async createChart(payload: CreateChartPayload): Promise<OrgChart> {
    const { data } = await api.post(BASE + "/", payload);
    return data;
  },

  async updateChart(id: number, payload: UpdateChartPayload): Promise<OrgChart> {
    const { data } = await api.patch(`${BASE}/${id}/`, payload);
    return data;
  },

  async deleteChart(id: number): Promise<void> {
    await api.delete(`${BASE}/${id}/`);
  },

  async getDraft(id: number): Promise<DraftPayload> {
    const { data } = await api.get(`${BASE}/${id}/draft/`);
    return data;
  },

  async saveDraft(id: number, payload: SaveDraftPayload): Promise<DraftPayload> {
    const { data } = await api.put(`${BASE}/${id}/draft/`, payload);
    return data;
  },

  async validateDraft(id: number, payload: SaveDraftPayload): Promise<ValidationResult> {
    const { data } = await api.post(`${BASE}/${id}/validate/`, payload);
    return data;
  },

  async getAudienceRoles(): Promise<RoleMini[]> {
    const { data } = await api.get(`${BASE}/audiences/roles/`);
    return data;
  },

  async getAudienceGroups(
    params?: Record<string, unknown>
  ): Promise<{ count: number; results: GroupMini[] }> {
    const { data } = await api.get(`${BASE}/audiences/groups/`, { params });
    return data;
  },

  async getRevisions(id: number): Promise<{ count: number; results: OrgChartRevision[] }> {
    const { data } = await api.get(`${BASE}/${id}/revisions/`);
    return data;
  },

  async publishChart(id: number, payload?: PublishPayload): Promise<OrgChartRevision> {
    const { data } = await api.post(`${BASE}/${id}/publish/`, payload || {});
    return data;
  },

  async unpublishChart(id: number): Promise<{ detail: string }> {
    const { data } = await api.post(`${BASE}/${id}/unpublish/`, {});
    return data;
  },
};
