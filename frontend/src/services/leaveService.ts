import api from "@/lib/api";
import type {
  LeaveRequest,
  LeaveBalance,
  GlobalSettings,
  PaginatedResponse,
  LeaveBalanceSummary,
  PendingMonthEntry,
} from "@/types";
import { bulkApproveEntities, rejectEntity } from "./bulkActionHelpers";
import { requestWithOfflineQueue } from "@/lib/offline/offlineQueue";

export const leaveService = {
  async getRequests(params?: {
    workspace_ids?: string;
    calendar?: boolean;
    status?: string;
    request_type?: "vacation" | "sick";
    page?: number;
    page_size?: number;
    ignore_date_filter?: string;
  }): Promise<PaginatedResponse<LeaveRequest>> {
    const { data } = await api.get<PaginatedResponse<LeaveRequest>>("/leave-management/requests/", {
      params,
    });
    return data;
  },

  async getRequest(id: number): Promise<LeaveRequest> {
    const { data } = await api.get<LeaveRequest>(`/leave-management/requests/${id}/`);
    return data;
  },

  async createRequest(payload: {
    user?: number;
    request_type: "vacation" | "sick";
    start_date: string;
    end_date: string;
    reason?: string;
  }): Promise<LeaveRequest> {
    return requestWithOfflineQueue(
      async () => {
        const { data } = await api.post<LeaveRequest>("/leave-management/requests/", payload);
        return data;
      },
      {
        url: "/leave-management/requests/",
        method: "POST",
        body: payload,
        headers: {},
        description: "Leave submission",
      }
    );
  },

  async updateRequest(id: number, payload: Partial<LeaveRequest>): Promise<LeaveRequest> {
    const { data } = await api.put<LeaveRequest>(`/leave-management/requests/${id}/`, payload);
    return data;
  },

  async deleteRequest(id: number): Promise<void> {
    await api.delete(`/leave-management/requests/${id}/`);
  },

  async getTeamLogs(params?: {
    workspace_ids?: string;
    status?: string;
    request_type?: "vacation" | "sick";
    page_size?: number;
  }): Promise<PaginatedResponse<LeaveRequest>> {
    const { data } = await api.get<PaginatedResponse<LeaveRequest>>(
      "/leave-management/requests/team_logs/",
      { params }
    );
    return data;
  },

  async getTeamPending(params?: {
    workspace_ids?: string;
    date_from?: string;
    date_to?: string;
    request_type?: "vacation" | "sick";
  }): Promise<LeaveRequest[]> {
    const { data } = await api.get<LeaveRequest[]>("/leave-management/requests/team_pending/", {
      params,
    });
    return data;
  },

  async getTeamPendingMonths(): Promise<PendingMonthEntry[]> {
    const { data } = await api.get<PendingMonthEntry[]>(
      "/leave-management/requests/team_pending_months/"
    );
    return data;
  },

  async getTeamBalances(params?: { workspace_ids?: string }): Promise<LeaveBalance[]> {
    const { data } = await api.get<LeaveBalance[] | PaginatedResponse<LeaveBalance>>(
      "/leave-management/balances/team_balances/",
      { params }
    );
    return Array.isArray(data) ? data : (data.results ?? []);
  },

  async approve(id: number): Promise<LeaveRequest> {
    const { data } = await api.post<LeaveRequest>(`/leave-management/requests/${id}/approve/`);
    return data;
  },

  async reject(id: number, rejectionReason: string): Promise<LeaveRequest> {
    return rejectEntity<LeaveRequest>("/leave-management/requests", id, rejectionReason);
  },

  async bulkApprove(
    ids: number[]
  ): Promise<{ approved_count: number; failed_ids: number[]; total_requested: number }> {
    return bulkApproveEntities("/leave-management/requests", ids);
  },

  async bulkReject(
    ids: number[],
    rejectionReason: string
  ): Promise<{ rejected_count: number; failed_ids: number[]; total_requested: number }> {
    const { data } = await api.post("/leave-management/requests/bulk_reject/", {
      ids,
      rejection_reason: rejectionReason,
    });
    return data;
  },

  async getBalances(params?: Record<string, unknown>): Promise<LeaveBalance[]> {
    // Backend returns paginated response; normalize here until API is standardized
    const { data } = await api.get<PaginatedResponse<LeaveBalance>>("/leave-management/balances/", {
      params,
    });
    return data.results ?? [];
  },

  async createBalance(payload: Partial<LeaveBalance>): Promise<LeaveBalance> {
    const { data } = await api.post<LeaveBalance>("/leave-management/balances/", payload);
    return data;
  },

  async updateBalance(id: number, payload: Partial<LeaveBalance>): Promise<LeaveBalance> {
    const { data } = await api.patch<LeaveBalance>(`/leave-management/balances/${id}/`, payload);
    return data;
  },

  async deleteBalance(id: number): Promise<void> {
    await api.delete(`/leave-management/balances/${id}/`);
  },

  async getSettings(): Promise<GlobalSettings> {
    const { data } = await api.get<{ results: GlobalSettings[] }>("/leave-management/settings/");
    if (!data.results?.length) throw new Error("GlobalSettings record not found");
    return data.results[0];
  },

  async updateSettings(payload: Partial<GlobalSettings>): Promise<GlobalSettings> {
    const current = await leaveService.getSettings();
    const { data } = await api.patch<GlobalSettings>(
      `/leave-management/settings/${current.id}/`,
      payload
    );
    return data;
  },

  async getUserBalanceSummary(): Promise<LeaveBalanceSummary> {
    const { data } = await api.get<LeaveBalanceSummary>(
      "/leave-management/balances/user_balance_summary/"
    );
    return data;
  },
};
