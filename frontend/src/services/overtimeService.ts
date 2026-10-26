import api from "@/lib/api";
import { normalizeList } from "@/lib/api-utils";
import { downloadBlobResponse, paginatedFetchAll } from "@/lib/download";
import type {
  OvertimeLog,
  Client,
  OvertimeSummary,
  AdminLogsPage,
  PaginatedResponse,
  PendingMonthEntry,
} from "@/types";
import { bulkApproveEntities, rejectEntity } from "./bulkActionHelpers";
import { requestWithOfflineQueue } from "@/lib/offline/offlineQueue";

/** What an entry would be paid, given the person's other entries that day. */
export interface OvertimeHoursPreview {
  hours: number;
  paid_window_start: string;
  paid_window_end: string;
}

/** What archiving, purging or deleting a client would touch (superuser endpoint). */
export interface ClientLifecycle {
  is_active: boolean;
  assigned_users: number;
  /** Records that must be kept, keyed by relation (overtime_logs, standby_logs, ...). */
  counts: Record<string, number>;
  /** Data a delete would take along (onboarding_folders, onboarding_documents). */
  cascade_counts: Record<string, number>;
  last_activity: string | null;
  can_delete: boolean;
  blockers: string[];
}

export const overtimeService = {
  async getClients(params?: Record<string, unknown>): Promise<Client[]> {
    const { data } = await api.get<Client[] | PaginatedResponse<Client>>("/overtime/clients/", {
      params,
    });
    return normalizeList(data);
  },

  /**
   * Only the active clients this user may record against — every form picker.
   *
   * Archived clients must never be offered for a new record (the API rejects
   * them anyway), but an existing record of an archived client still has to
   * render its own client, so edit dialogs inject that one client back.
   */
  async getActiveClients(): Promise<Client[]> {
    return overtimeService.getClients({ is_active: true });
  },

  /** All active clients — for the Settings self-assignment picker. */
  async getAvailableClients(): Promise<Client[]> {
    const { data } = await api.get<Client[] | PaginatedResponse<Client>>(
      "/overtime/clients/available/"
    );
    return normalizeList(data);
  },

  async createClient(payload: Partial<Client>): Promise<Client> {
    const { data } = await api.post<Client>("/overtime/clients/", payload);
    return data;
  },

  async updateClient(id: number, payload: Partial<Client>): Promise<Client> {
    const { data } = await api.put<Client>(`/overtime/clients/${id}/`, payload);
    return data;
  },

  async deleteClient(id: number): Promise<void> {
    await api.delete(`/overtime/clients/${id}/`);
  },

  /** Retire a client: hidden from users and pickers, every record kept. */
  async archiveClient(
    id: number
  ): Promise<{ id: number; is_active: boolean; users_unassigned: number }> {
    const { data } = await api.post<{ id: number; is_active: boolean; users_unassigned: number }>(
      `/overtime/clients/${id}/archive/`
    );
    return data;
  },

  async unarchiveClient(id: number): Promise<{ id: number; is_active: boolean }> {
    const { data } = await api.post<{ id: number; is_active: boolean }>(
      `/overtime/clients/${id}/unarchive/`
    );
    return data;
  },

  async getClientLifecycle(id: number): Promise<ClientLifecycle> {
    const { data } = await api.get<ClientLifecycle>(`/overtime/clients/${id}/lifecycle/`);
    return data;
  },

  async getLogs(params?: {
    workspace_ids?: string;
    calendar?: boolean;
    date_from?: string;
    date_to?: string;
    status?: string;
    client?: number;
    page?: number;
    page_size?: number;
    ignore_date_filter?: string;
  }): Promise<PaginatedResponse<OvertimeLog>> {
    const { data } = await api.get<PaginatedResponse<OvertimeLog>>("/overtime/logs/", { params });
    return data;
  },

  async downloadAllLogs(params?: {
    workspace_ids?: string;
    date_from?: string;
    date_to?: string;
    status?: string;
    search?: string;
    ignore_date_filter?: string;
  }): Promise<OvertimeLog[]> {
    return paginatedFetchAll<OvertimeLog>(({ page, page_size }) =>
      api.get<PaginatedResponse<OvertimeLog>>("/overtime/logs/", {
        params: { ...params, page, page_size },
      })
    );
  },

  /**
   * Trigger a streaming CSV download from the /overtime/logs/export/
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
    const response = await api.get("/overtime/logs/export/", {
      params,
      responseType: "blob",
    });
    downloadBlobResponse(response.data, "overtime_logs.csv");
  },

  async previewHours(params: {
    date: string;
    start_time: string;
    end_time: string;
    exclude?: number;
    user?: string;
  }): Promise<OvertimeHoursPreview> {
    const { data } = await api.get<OvertimeHoursPreview>("/overtime/logs/preview/", { params });
    return data;
  },

  async getLog(id: number): Promise<OvertimeLog> {
    const { data } = await api.get<OvertimeLog>(`/overtime/logs/${id}/`);
    return data;
  },

  async createLog(payload: {
    user?: number;
    client: number;
    date: string;
    start_time?: string;
    end_time?: string;
    hours?: number;
    description?: string;
    evidence_type?: "ticket" | "email" | "call" | "other";
    evidence?: string;
    reference_code?: string;
  }): Promise<OvertimeLog> {
    return requestWithOfflineQueue(
      async () => {
        const { data } = await api.post<OvertimeLog>("/overtime/logs/", payload);
        return data;
      },
      {
        url: "/overtime/logs/",
        method: "POST",
        body: payload,
        headers: {},
        description: "Overtime submission",
      }
    );
  },

  async updateLog(id: number, payload: Partial<OvertimeLog>): Promise<OvertimeLog> {
    const { data } = await api.put<OvertimeLog>(`/overtime/logs/${id}/`, payload);
    return data;
  },

  async deleteLog(id: number): Promise<void> {
    // ignore_date_filter bypasses PersonalOnlyFilterMixin's current-month
    // default so past-month pending records (e.g. carried-over) can be
    // found and deleted. MonthlyLockMixin still gates the permission check.
    await api.delete(`/overtime/logs/${id}/?ignore_date_filter=true`);
  },

  async approve(id: number): Promise<OvertimeLog> {
    const { data } = await api.post<OvertimeLog>(`/overtime/logs/${id}/approve/`);
    return data;
  },

  async reject(id: number, rejectionReason: string): Promise<OvertimeLog> {
    return rejectEntity<OvertimeLog>("/overtime/logs", id, rejectionReason);
  },

  async bulkApprove(
    ids: number[]
  ): Promise<{ approved_count: number; failed_ids: number[]; total_requested: number }> {
    return bulkApproveEntities("/overtime/logs", ids);
  },

  async bulkReject(
    ids: number[],
    rejectionReason: string
  ): Promise<{ rejected_count: number; failed_ids: number[]; total_requested: number }> {
    const { data } = await api.post("/overtime/logs/bulk_reject/", {
      ids,
      rejection_reason: rejectionReason,
    });
    return data;
  },

  async bulkDelete(
    ids: number[]
  ): Promise<{ deleted_count: number; failed_ids: number[]; total_requested: number }> {
    const { data } = await api.post("/overtime/logs/bulk_delete/", { ids });
    return data;
  },

  async getSummary(): Promise<OvertimeSummary> {
    const { data } = await api.get<OvertimeSummary>("/overtime/logs/summary/");
    return data;
  },

  async getTeamLogs(params?: {
    workspace_ids?: string;
    status?: string;
    client?: number;
    date?: string;
    page_size?: number;
  }): Promise<PaginatedResponse<OvertimeLog>> {
    const { data } = await api.get<PaginatedResponse<OvertimeLog>>("/overtime/logs/team_logs/", {
      params,
    });
    return data;
  },

  async getTeamPending(params?: {
    workspace_ids?: string;
    date_from?: string;
    date_to?: string;
  }): Promise<OvertimeLog[]> {
    const { data } = await api.get<OvertimeLog[]>("/overtime/logs/team_pending/", { params });
    return data;
  },

  async getTeamPendingMonths(): Promise<PendingMonthEntry[]> {
    const { data } = await api.get<PendingMonthEntry[]>("/overtime/logs/team_pending_months/");
    return data;
  },

  async getAdminLogs(params?: {
    status?: string;
    client?: number;
    date?: string;
    date_from?: string;
    date_to?: string;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<AdminLogsPage<OvertimeLog>> {
    const { data } = await api.get<AdminLogsPage<OvertimeLog>>("/overtime/logs/admin_logs/", {
      params,
    });
    return data;
  },
};
