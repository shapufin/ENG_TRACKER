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

interface AuditArchiveStatus {
  target_month: string;
  target_month_label: string;
  eligible_count: number;
  core_count: number;
  plugin_count: number;
  archives: Array<{
    filename: string;
    size_bytes: number;
    size_formatted: string;
    created_at: string;
  }>;
}

interface AuditArchiveResult {
  success: boolean;
  archived_count: number;
  core_count?: number;
  plugin_count?: number;
  filename: string;
  month: string;
  month_label: string;
  size_bytes: number;
  size_formatted?: string;
  download_url?: string;
  message?: string;
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

  async getArchiveStatus(): Promise<AuditArchiveStatus> {
    const { data } = await api.get<AuditArchiveStatus>("/reports/audit-logs/archive_status/");
    return data;
  },

  async archivePreviousMonth(month?: string): Promise<AuditArchiveResult> {
    const { data } = await api.post<AuditArchiveResult>(
      "/reports/audit-logs/archive_previous_month/",
      {
        month,
      }
    );
    return data;
  },

  async downloadArchive(filename: string): Promise<Blob> {
    const { data } = await api.get<Blob>("/reports/audit-logs/download_archive/", {
      params: { filename },
      responseType: "blob",
    });
    return data;
  },
};
