import api from "@/lib/api";
import type {
  User,
  UserProfile,
  Team,
  Tech,
  TechLevel,
  TechMember,
  TechAssignmentInput,
  TechFacetsResponse,
  PaginatedResponse,
  UserStats,
  CalendarGroupStats,
} from "@/types";

export type ControlRoomEligibleUser = Pick<User, "id" | "username" | "email" | "full_name">;

interface ApprovalPeriodCloseStatus {
  period: string;
  requested_processing_period: string;
  status: "open" | "finalized";
  close: {
    id: number;
    period: string;
    closed_at: string;
    closed_by: number | null;
    status: "finalized";
    affected_member_count: number;
    affected_team_count: number;
  } | null;
}

interface ApprovalPeriodFinalizeResult {
  id: number;
  period: string;
  requested_processing_period: string;
  closed_at: string;
  closed_by: number | null;
  status: "finalized";
  affected_member_count: number;
  affected_team_count: number;
  already_finalized: boolean;
}

export const userService = {
  async getUsers(params?: Record<string, unknown>): Promise<PaginatedResponse<User>> {
    const { data } = await api.get<PaginatedResponse<User>>("/users/users/", { params });
    return data;
  },

  async getEligibleControlRoomUsers(
    params?: Record<string, unknown>
  ): Promise<PaginatedResponse<ControlRoomEligibleUser>> {
    const { data } = await api.get<PaginatedResponse<ControlRoomEligibleUser>>(
      "/users/users/eligible_for_control_room/",
      { params }
    );
    return data;
  },

  async getUser(id: number): Promise<User> {
    const { data } = await api.get<User>(`/users/users/${id}/`);
    return data;
  },

  async deleteUser(id: number): Promise<void> {
    await api.delete(`/users/users/${id}/`);
  },

  /** Self-assign the clients the current user works for (Settings page). */
  async assignClients(clientIds: number[]): Promise<User> {
    const { data } = await api.post<User>("/users/users/assign_clients/", {
      client_ids: clientIds,
    });
    return data;
  },

  /** TL/admin assign: set a team member's clients (Client Assignment card). */
  async assignMemberClients(userId: number, clientIds: number[]): Promise<User> {
    const { data } = await api.post<User>(`/users/users/${userId}/assign_member_clients/`, {
      client_ids: clientIds,
    });
    return data;
  },

  /** Admin Users list. Level filtering params (comma-joined, matching the
   * backend's getlist-style parsing):
   * - `tech`: tech ids
   * - `tech_level`: level ids held in the selected techs
   * - `min_tech_level_rank`: integer — "this level or more senior", matched
   *   against the SAME assignment row as `tech` (viewsets._apply_tech_filters)
   */
  async getProfiles(params?: Record<string, unknown>): Promise<PaginatedResponse<UserProfile>> {
    const { data } = await api.get<PaginatedResponse<UserProfile>>("/users/profiles/", { params });
    return data;
  },

  /** Live per-tech profile counts for the Admin Users tech-filter chips,
   * scoped by the same `role`/`no_tech`/`search` params as getProfiles. */
  async getTechFacets(params?: Record<string, unknown>): Promise<TechFacetsResponse> {
    const { data } = await api.get<TechFacetsResponse>("/users/profiles/tech_facets/", { params });
    return data;
  },

  async updateProfile(id: number, payload: Partial<UserProfile>): Promise<UserProfile> {
    const { data } = await api.put<UserProfile>(`/users/profiles/${id}/`, payload);
    return data;
  },

  /** HR/admin: set or clear which TL an existing employee reports to.
   * Narrowly scoped — only writes the employee's own italian_tl/albanian_tl
   * FK, never role flags. `teamLeaderUserId: null` clears the assignment. */
  async setTeamLeader(
    profileId: number,
    role: "italian_tl" | "albanian_tl",
    teamLeaderUserId: number | null
  ): Promise<UserProfile> {
    const { data } = await api.post<UserProfile>(
      `/users/profiles/${profileId}/set_team_leader/`,
      { role, team_leader_user_id: teamLeaderUserId }
    );
    return data;
  },

  async getTeams(params?: Record<string, unknown>): Promise<PaginatedResponse<Team>> {
    const { data } = await api.get<PaginatedResponse<Team>>("/users/teams/", { params });
    return data;
  },

  async getTechs(params?: Record<string, unknown>): Promise<PaginatedResponse<Tech>> {
    const { data } = await api.get<PaginatedResponse<Tech>>("/users/techs/", { params });
    return data;
  },

  async createTech(
    payload: Pick<Tech, "name" | "code"> & Partial<Pick<Tech, "description" | "is_active">>
  ): Promise<Tech> {
    const { data } = await api.post<Tech>("/users/techs/", payload);
    return data;
  },

  async updateTech(id: number, payload: Partial<Omit<Tech, "id">>): Promise<Tech> {
    const { data } = await api.patch<Tech>(`/users/techs/${id}/`, payload);
    return data;
  },

  async deleteTech(id: number): Promise<void> {
    await api.delete(`/users/techs/${id}/`);
  },

  async getTechMembers(techId: number): Promise<PaginatedResponse<TechMember>> {
    const { data } = await api.get<PaginatedResponse<TechMember>>(`/users/techs/${techId}/users/`);
    return data;
  },

  /** Omit `level` to leave grades alone; pass one to grade every listed user.
   * `added` counts new members; `regraded` counts existing ones whose level
   * changed, so a pure re-grade does not look like nothing happened. */
  async addTechMembers(
    techId: number,
    userIds: number[],
    level?: number | null
  ): Promise<{ added: number; regraded: number }> {
    const { data } = await api.post<{ added: number; regraded: number }>(
      `/users/techs/${techId}/add_users/`,
      { user_ids: userIds, ...(level === undefined ? {} : { level }) }
    );
    return data;
  },

  async getTechLevels(params?: Record<string, unknown>): Promise<PaginatedResponse<TechLevel>> {
    const { data } = await api.get<PaginatedResponse<TechLevel>>("/users/tech-levels/", { params });
    return data;
  },

  async createTechLevel(
    payload: Pick<TechLevel, "tech" | "name" | "code" | "rank"> &
      Partial<Pick<TechLevel, "description" | "is_active">>
  ): Promise<TechLevel> {
    const { data } = await api.post<TechLevel>("/users/tech-levels/", payload);
    return data;
  },

  async updateTechLevel(id: number, payload: Partial<Omit<TechLevel, "id">>): Promise<TechLevel> {
    const { data } = await api.patch<TechLevel>(`/users/tech-levels/${id}/`, payload);
    return data;
  },

  async deleteTechLevel(id: number): Promise<void> {
    await api.delete(`/users/tech-levels/${id}/`);
  },

  /** Rewrites every rank for the Tech. `levelIds` must list them all. */
  async reorderTechLevels(techId: number, levelIds: number[]): Promise<{ reordered: number }> {
    const { data } = await api.post<{ reordered: number }>(
      `/users/techs/${techId}/reorder_levels/`,
      { level_ids: levelIds }
    );
    return data;
  },

  async removeTechMembers(techId: number, userIds: number[]): Promise<{ removed: number }> {
    const { data } = await api.post<{ removed: number }>(`/users/techs/${techId}/remove_users/`, {
      user_ids: userIds,
    });
    return data;
  },

  async getMe(): Promise<User> {
    const { data } = await api.get<User>("/users/users/me/");
    return data;
  },

  async getTeamLeaders(type: "italian" | "albanian" | "all" = "all"): Promise<User[]> {
    const { data } = await api.get<User[]>("/users/users/team_leaders/", { params: { type } });
    return data;
  },

  async getItalianTeamLeaders(): Promise<
    Array<{
      id: number;
      username: string;
      full_name: string;
      team_name: string | null;
      member_count: number;
    }>
  > {
    const { data } = await api.get<
      Array<{
        id: number;
        username: string;
        full_name: string;
        team_name: string | null;
        member_count: number;
      }>
    >("/users/users/italian_team_leaders/");
    return data;
  },

  async getAlbanianTeamLeaders(): Promise<
    Array<{
      id: number;
      username: string;
      full_name: string;
      team_name: string | null;
      member_count: number;
    }>
  > {
    const { data } = await api.get<
      Array<{
        id: number;
        username: string;
        full_name: string;
        team_name: string | null;
        member_count: number;
      }>
    >("/users/users/albanian_team_leaders/");
    return data;
  },

  async getMyTeamMembers(): Promise<UserProfile[]> {
    const { data } = await api.get<UserProfile[]>("/users/users/my_team_members/");
    return data;
  },

  async getApprovalPeriodStatus(period: string): Promise<ApprovalPeriodCloseStatus> {
    const { data } = await api.get<ApprovalPeriodCloseStatus>("/users/approval-periods/status/", {
      params: { period },
    });
    return data;
  },

  async finalizeApprovalPeriod(period: string): Promise<ApprovalPeriodFinalizeResult> {
    const { data } = await api.post<ApprovalPeriodFinalizeResult>(
      "/users/approval-periods/finalize/",
      { period }
    );
    return data;
  },

  async getItalianTeamMembers(italianTlId: number): Promise<UserProfile[]> {
    const { data } = await api.get<UserProfile[]>("/users/users/italian_team_members/", {
      params: { italian_tl_id: italianTlId },
    });
    return data;
  },

  async getAlbanianTeamMembers(albanianTlId: number): Promise<UserProfile[]> {
    const { data } = await api.get<UserProfile[]>("/users/users/albanian_team_members/", {
      params: { albanian_tl_id: albanianTlId },
    });
    return data;
  },

  async resetPassword(userId: number, newPassword: string): Promise<{ detail: string }> {
    const { data } = await api.post(`/users/users/${userId}/reset_password/`, {
      new_password: newPassword,
    });
    return data;
  },

  async bulkUpdateUsers(payload: {
    user_ids: number[];
    teams?: number[];
    techs?: TechAssignmentInput[];
    italian_tl?: number | null;
    albanian_tl?: number | null;
    is_hr?: boolean;
    is_italian_tl_role?: boolean;
    is_albanian_tl_role?: boolean;
  }): Promise<{ detail: string; updated_count: number }> {
    const { data } = await api.post<{ detail: string; updated_count: number }>(
      "/users/users/bulk_update/",
      payload
    );
    return data;
  },

  async createUser(payload: {
    username: string;
    email: string;
    password: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    teams?: number[];
    techs?: TechAssignmentInput[];
    albanian_tl?: number | null;
    italian_tl?: number | null;
    is_hr?: boolean;
    is_italian_tl_role?: boolean;
    is_albanian_tl_role?: boolean;
    is_cr_admin?: boolean;
    roles?: string[];
  }): Promise<User> {
    const { data } = await api.post<User>("/users/users/create_user/", payload);
    return data;
  },

  async updateUser(
    userId: number,
    payload: {
      email?: string;
      first_name?: string;
      last_name?: string;
      phone?: string;
      teams?: number[];
      techs?: TechAssignmentInput[];
      albanian_tl?: number | null;
      italian_tl?: number | null;
      is_hr?: boolean;
      hire_date?: string | null;
      is_italian_tl_role?: boolean;
      is_albanian_tl_role?: boolean;
      is_cr_admin?: boolean;
      roles?: string[];
    }
  ): Promise<User> {
    const { data } = await api.put<User>(`/users/users/${userId}/update_user/`, payload);
    return data;
  },

  async createTeam(payload: {
    name: string;
    code: string;
    description?: string;
    team_leader_id?: number | null;
    parent_team_id?: number | null;
    calendar_group?: string;
  }): Promise<Team> {
    const { data } = await api.post<Team>("/users/teams/", payload);
    return data;
  },

  async updateTeam(id: number, payload: Partial<Team>): Promise<Team> {
    const { data } = await api.patch<Team>(`/users/teams/${id}/`, payload);
    return data;
  },

  async deleteTeam(id: number): Promise<void> {
    await api.delete(`/users/teams/${id}/`);
  },

  async getCalendarGroups(): Promise<Array<{ calendar_group: string; team_count: number }>> {
    const { data } = await api.get<Array<{ calendar_group: string; team_count: number }>>(
      "/users/teams/calendar_groups/"
    );
    return data;
  },

  async updateCalendarGroup(id: number, calendar_group: string): Promise<Team> {
    const { data } = await api.patch<Team>(`/users/teams/${id}/`, { calendar_group });
    return data;
  },

  async deleteCalendarGroup(id: number): Promise<void> {
    await api.delete(`/users/teams/${id}/`);
  },

  async bulkDeleteUsers(
    ids: number[]
  ): Promise<{ deleted_count: number; failed_ids: number[]; total_requested: number }> {
    const { data } = await api.post<{
      deleted_count: number;
      failed_ids: number[];
      total_requested: number;
    }>("/users/users/bulk_delete/", { ids });
    return data;
  },

  async getUserStats(): Promise<UserStats> {
    const { data } = await api.get<UserStats>("/users/users/stats/");
    return data;
  },

  async getCalendarGroupStats(): Promise<CalendarGroupStats> {
    const { data } = await api.get<CalendarGroupStats>("/users/teams/calendar_group_stats/");
    return data;
  },

  async bulkUpdateCalendarGroup(
    teamIds: number[],
    calendarGroup: string
  ): Promise<{ updated_count: number; calendar_group: string }> {
    const { data } = await api.post<{ updated_count: number; calendar_group: string }>(
      "/users/teams/bulk_update_calendar_group/",
      {
        team_ids: teamIds,
        calendar_group: calendarGroup,
      }
    );
    return data;
  },

  async renameCalendarGroup(oldName: string, newName: string): Promise<{ updated_count: number }> {
    const { data } = await api.post<{ updated_count: number }>(
      "/users/teams/rename_calendar_group/",
      {
        old_name: oldName,
        new_name: newName,
      }
    );
    return data;
  },

  async clearCalendarGroup(calendarGroup: string): Promise<{ updated_count: number }> {
    const { data } = await api.post<{ updated_count: number }>(
      "/users/teams/clear_calendar_group/",
      {
        calendar_group: calendarGroup,
      }
    );
    return data;
  },
};
