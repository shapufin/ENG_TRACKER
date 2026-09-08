/**
 * Control Room plugin API service.
 *
 * All endpoints are under /api/plugins/control_room/.
 * Access management: /access/ (admin only).
 * Dashboard: /dashboard/summary/, /dashboard/trend/, /dashboard/roster/.
 */
import api from "@/lib/api";
import type {
  ControlRoomAccess,
  ControlRoomMeResponse,
  ControlRoomSummaryResponse,
  ControlRoomTrendPoint,
  ControlRoomRosterResponse,
  ControlRoomDashboardParams,
} from "../types";

const BASE = "/plugins/control_room";

export const controlRoomService = {
  // --- Access management (admin) ---

  async getAccessList(): Promise<ControlRoomAccess[]> {
    const { data } = await api.get<ControlRoomAccess[]>(`${BASE}/access/`);
    return data;
  },

  async createAccess(payload: {
    user: number;
    is_active?: boolean;
    display_name?: string;
    timezone?: string;
    team_ids?: number[];
  }): Promise<ControlRoomAccess> {
    const { data } = await api.post<ControlRoomAccess>(`${BASE}/access/`, payload);
    return data;
  },

  /**
   * One-step "Create CR User": creates a normal Django user AND grants them
   * Control Room access with the given team scopes in one atomic transaction.
   * The created user is a normal user (no schema flag); only the access +
   * scope rows are plugin-owned and removable with the plugin.
   */
  async createCRUser(payload: {
    username: string;
    email: string;
    password: string;
    first_name?: string;
    last_name?: string;
    team_ids?: number[];
    display_name?: string;
    is_active?: boolean;
  }): Promise<ControlRoomAccess> {
    const { data } = await api.post<ControlRoomAccess>(`${BASE}/access/create_cr_user/`, payload);
    return data;
  },

  /**
   * Update a CR user's basic info + team scopes in one call.
   * This is the CR admin's simplified edit endpoint.
   */
  async updateCRUser(payload: {
    user_id: number;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    team_ids?: number[];
    is_active?: boolean;
  }): Promise<ControlRoomAccess> {
    const { data } = await api.post<ControlRoomAccess>(`${BASE}/access/update_cr_user/`, payload);
    return data;
  },

  /**
   * Bulk update CR access records: replace team scopes and/or toggle
   * is_active for multiple users at once. Mirrors the field set of
   * updateCRUser minus per-user basic info (first_name etc.).
   */
  async bulkUpdateCRUsers(payload: {
    user_ids: number[];
    team_ids?: number[];
    is_active?: boolean;
  }): Promise<{
    updated_count: number;
    failed_ids: number[];
    total_requested: number;
  }> {
    const { data } = await api.post<{
      updated_count: number;
      failed_ids: number[];
      total_requested: number;
    }>(`${BASE}/access/bulk_update_cr_users/`, payload);
    return data;
  },

  /**
   * Fetch access records filtered by a set of user IDs. Used by the core
   * UsersPage badge column to resolve CR status for the visible page of
   * users in O(1) query. Returns only the access rows that exist.
   */
  async getAccessByUserIds(userIds: number[], onlyActive = false): Promise<ControlRoomAccess[]> {
    if (userIds.length === 0) return [];
    const params: Record<string, string> = {
      user_id__in: userIds.join(","),
    };
    if (onlyActive) params.is_active = "true";
    const { data } = await api.get<ControlRoomAccess[]>(`${BASE}/access/`, { params });
    return data;
  },

  async updateAccess(
    id: number,
    payload: Partial<Pick<ControlRoomAccess, "is_active" | "display_name" | "timezone">>
  ): Promise<ControlRoomAccess> {
    const { data } = await api.patch<ControlRoomAccess>(`${BASE}/access/${id}/`, payload);
    return data;
  },

  async deleteAccess(id: number): Promise<void> {
    await api.delete(`${BASE}/access/${id}/`);
  },

  // --- Self-info (any authenticated user) ---

  async getMe(): Promise<ControlRoomMeResponse> {
    const { data } = await api.get<ControlRoomMeResponse>(`${BASE}/access/me/`);
    return data;
  },

  // --- Dashboard (read-only, scoped) ---

  async getSummary(params: ControlRoomDashboardParams): Promise<ControlRoomSummaryResponse> {
    const { data } = await api.get<ControlRoomSummaryResponse>(`${BASE}/dashboard/summary/`, {
      params,
    });
    return data;
  },

  async getTrend(params: ControlRoomDashboardParams): Promise<ControlRoomTrendPoint[]> {
    const { data } = await api.get<ControlRoomTrendPoint[]>(`${BASE}/dashboard/trend/`, {
      params,
    });
    return data;
  },

  async getRoster(params: ControlRoomDashboardParams): Promise<ControlRoomRosterResponse> {
    const { data } = await api.get<ControlRoomRosterResponse>(`${BASE}/dashboard/roster/`, {
      params,
    });
    return data;
  },
};
