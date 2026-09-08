import api from "@/lib/api";
import { AxiosError } from "axios";

interface AuditLogEntry {
  id: number;
  user: {
    id: number;
    username: string;
    email: string;
  };
  action: string;
  description: string;
  content_type?: string;
  object_id?: string;
  ip_address?: string;
  status: string;
  timestamp: string;
}

interface AuditLogSummary {
  total_logs: number;
  logs_today: number;
  logs_this_week: number;
  logs_this_month: number;
  actions_breakdown: Record<string, number>;
  most_active_users: Array<{ username: string; count: number }>;
  recent_logs: AuditLogEntry[];
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof AxiosError && error.response?.status === 404;
}

export const auditLogService = {
  async getSummary(): Promise<AuditLogSummary> {
    try {
      const { data } = await api.get<AuditLogSummary>("/plugins/audit_log/logs/summary/");
      return data;
    } catch (error) {
      if (isNotFoundError(error)) {
        console.warn("Audit log summary endpoint not available");
        return {
          total_logs: 0,
          logs_today: 0,
          logs_this_week: 0,
          logs_this_month: 0,
          actions_breakdown: {},
          most_active_users: [],
          recent_logs: [],
        };
      }
      throw error;
    }
  },

  async getRecentLogs(limit: number = 10): Promise<AuditLogEntry[]> {
    try {
      const { data } = await api.get<AuditLogSummary>("/plugins/audit_log/logs/summary/");
      return data.recent_logs?.slice(0, limit) || [];
    } catch (error) {
      if (isNotFoundError(error)) {
        console.warn("Audit log endpoint not available");
        return [];
      }
      throw error;
    }
  },
};
