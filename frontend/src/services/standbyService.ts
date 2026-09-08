import api from "@/lib/api";
import { downloadBlobResponse, paginatedFetchAll } from "@/lib/download";
import type { StandbyLog, PaginatedResponse, PendingMonthEntry } from "@/types";
import { bulkApproveEntities, rejectEntity } from "./bulkActionHelpers";
import { requestWithOfflineQueue } from "@/lib/offline/offlineQueue";

export const standbyService = {
  async getLogs(params?: {
    workspace_ids?: string;
    calendar?: boolean;
    date_from?: string;
    date_to?: string;
    status?: string;
    page?: number;
    page_size?: number;
    ignore_date_filter?: string;
  }): Promise<PaginatedResponse<StandbyLog>> {
    const { data } = await api.get<PaginatedResponse<StandbyLog>>("/standby/logs/", { params });
    return data;
  },

  async downloadAllLogs(params?: {
    workspace_ids?: string;
    date_from?: string;
    date_to?: string;
    status?: string;
    ignore_date_filter?: string;
  }): Promise<StandbyLog[]> {
    return paginatedFetchAll<StandbyLog>(({ page, page_size }) =>
      api.get<PaginatedResponse<StandbyLog>>("/standby/logs/", {
        params: { ...params, page, page_size },
      })
    );
  },

  /**
   * Trigger a streaming CSV download from the /standby/logs/export/
   * endpoint. The backend streams the full filtered set via
   * StreamingHttpResponse — no 10k row ceiling, no client-side
   * accumulation. Returns void; the browser handles the download.
   */
  async exportCsv(params?: {
    workspace_ids?: string;
    date_from?: string;
    date_to?: string;
    status?: string;
    ignore_date_filter?: string;
    user?: string;
  }): Promise<void> {
    const response = await api.get("/standby/logs/export/", {
      params,
      responseType: "blob",
    });
    downloadBlobResponse(response.data, "standby_logs.csv");
  },

  async getLog(id: number): Promise<StandbyLog> {
    const { data } = await api.get<StandbyLog>(`/standby/logs/${id}/`);
    return data;
  },

  async createLog(payload: {
    user?: number;
    pattern?: number | null;
    date: string;
    start_time?: string;
    end_time?: string;
    hours?: number;
    description?: string;
    evidence?: string;
  }): Promise<StandbyLog> {
    return requestWithOfflineQueue(
      async () => {
        const { data } = await api.post<StandbyLog>("/standby/logs/", payload);
        return data;
      },
      {
        url: "/standby/logs/",
        method: "POST",
        body: payload,
        headers: {},
        description: "Standby submission",
      }
    );
  },

  async updateLog(id: number, payload: Partial<StandbyLog>): Promise<StandbyLog> {
    const { data } = await api.put<StandbyLog>(`/standby/logs/${id}/`, payload);
    return data;
  },

  async deleteLog(id: number): Promise<void> {
    // ignore_date_filter bypasses PersonalOnlyFilterMixin's current-month
    // default so past-month pending records (e.g. carried-over) can be
    // found and deleted. MonthlyLockMixin still gates the permission check.
    await api.delete(`/standby/logs/${id}/?ignore_date_filter=true`);
  },

  async approve(id: number): Promise<StandbyLog> {
    const { data } = await api.post<StandbyLog>(`/standby/logs/${id}/approve/`);
    return data;
  },

  async reject(id: number, rejectionReason: string): Promise<StandbyLog> {
    return rejectEntity<StandbyLog>("/standby/logs", id, rejectionReason);
  },

  async bulkApprove(
    ids: number[]
  ): Promise<{ approved_count: number; failed_ids: number[]; total_requested: number }> {
    return bulkApproveEntities("/standby/logs", ids);
  },

  async bulkReject(
    ids: number[],
    rejectionReason: string
  ): Promise<{ rejected_count: number; failed_ids: number[]; total_requested: number }> {
    const { data } = await api.post("/standby/logs/bulk_reject/", {
      ids,
      rejection_reason: rejectionReason,
    });
    return data;
  },

  async bulkDelete(
    ids: number[]
  ): Promise<{ deleted_count: number; failed_ids: number[]; total_requested: number }> {
    const { data } = await api.post("/standby/logs/bulk_delete/", { ids });
    return data;
  },

  async getTeamLogs(params?: {
    workspace_ids?: string;
    status?: string;
    date?: string;
    page_size?: number;
  }): Promise<PaginatedResponse<StandbyLog>> {
    const { data } = await api.get<PaginatedResponse<StandbyLog>>("/standby/logs/team_logs/", {
      params,
    });
    return data;
  },

  async getTeamPending(params?: {
    workspace_ids?: string;
    date_from?: string;
    date_to?: string;
  }): Promise<StandbyLog[]> {
    const { data } = await api.get<StandbyLog[]>("/standby/logs/team_pending/", { params });
    return data;
  },

  async getTeamPendingMonths(): Promise<PendingMonthEntry[]> {
    const { data } = await api.get<PendingMonthEntry[]>("/standby/logs/team_pending_months/");
    return data;
  },

  async getAdminLogs(params?: {
    status?: string;
    date?: string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<StandbyLog>> {
    const { data } = await api.get<PaginatedResponse<StandbyLog>>("/standby/logs/admin_logs/", {
      params,
    });
    return data;
  },
};
