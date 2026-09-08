import api from "@/lib/api";
import type { PaginatedResponse } from "@/types";

export interface AuditLog {
  id: number;
  user: number;
  user_name: string;
  action: string;
  action_display: string;
  model_name: string;
  model_name_display: string;
  object_id: string;
  object_repr: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string;
  timestamp: string;
  changes_summary?: string;
  extra_data: Record<string, unknown> | null;
}

export interface AuditLogStats {
  total_logs: number;
  logs_today: number;
  logs_this_week: number;
  logs_this_month: number;
  unique_users: number;
  failed_actions: number;
  success_rate: number;
}

interface AuditLogQueryParams {
  page?: number;
  page_size?: number;
  action?: string;
  model_name?: string;
  search?: string;
}

interface AuditLogStatsParams {
  action?: string;
  model_name?: string;
  search?: string;
}

export const auditService = {
  async getLogs(params: AuditLogQueryParams = {}): Promise<PaginatedResponse<AuditLog>> {
    const { data } = await api.get<PaginatedResponse<AuditLog>>("/reports/audit-logs/", { params });
    return data;
  },

  async getStats(params: AuditLogStatsParams = {}): Promise<AuditLogStats> {
    const { data } = await api.get<AuditLogStats>("/reports/audit-logs/stats/", { params });
    return data;
  },

  async getLogHistory(modelName: string, objectId: string): Promise<AuditLog[]> {
    const { data } = await api.get<AuditLog[]>(`/reports/audit-logs/history/`, {
      params: { model_name: modelName, object_id: objectId },
    });
    return data;
  },
};
