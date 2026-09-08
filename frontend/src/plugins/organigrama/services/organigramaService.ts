/** API service for the Organigrama plugin. */
import api from "@/lib/api";
import { extractResponseResults } from "@/lib/api-utils";
import type { PaginatedResponse } from "@/types";
import type { OrgChart, DraftPayload, OrgTreeResponse } from "../types";

const BASE = "/plugins/organigrama";

export const organigramaService = {
  async getTree(): Promise<OrgTreeResponse> {
    const { data } = await api.get<OrgTreeResponse>(`${BASE}/tree/`);
    return data;
  },

  async getVisibleCharts(): Promise<OrgChart[]> {
    const { data } = await api.get<OrgChart[] | PaginatedResponse<OrgChart>>(
      `${BASE}/charts/visible/`
    );
    return extractResponseResults({ data });
  },

  async getPublishedChart(chartId: number): Promise<DraftPayload> {
    const { data } = await api.get<DraftPayload>(`${BASE}/charts/${chartId}/published/`);
    return data;
  },

  async getSubtree(
    nodeId: number,
    nodeType: "person" | "tech"
  ): Promise<{ children: import("../types").TreeNode[] }> {
    const { data } = await api.get<{ children: import("../types").TreeNode[] }>(
      `${BASE}/subtree/`,
      { params: { node_id: nodeId, node_type: nodeType } }
    );
    return data;
  },
};
