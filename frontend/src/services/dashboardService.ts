import api from "@/lib/api";
import { normalizeList } from "@/lib/api-utils";
import type {
  DashboardStats,
  TeamDashboardStats,
  CalendarWorkspace,
  UserCalendarPreference,
  User,
  PublicHoliday,
  PaginatedResponse,
  PendingTrendData,
  TopPendingUser,
  QueueHighlight,
  MonthlyComparisonData,
} from "@/types";

export const dashboardService = {
  async getHRStats(): Promise<DashboardStats> {
    const { data } = await api.get<DashboardStats>("/dashboard/widgets/global_stats/");
    return data;
  },

  async getTeamStats(teamId?: number): Promise<TeamDashboardStats> {
    const params: Record<string, string | number> = {};
    if (teamId) params.team_id = teamId;
    const { data } = await api.get<TeamDashboardStats>("/dashboard/widgets/team_stats/", {
      params,
    });
    return data;
  },

  async getPendingTrend(teamId?: number): Promise<PendingTrendData[]> {
    const params: Record<string, string | number> = {};
    if (teamId) params.team_id = teamId;
    const { data } = await api.get<PendingTrendData[]>("/dashboard/widgets/pending_trend/", {
      params,
    });
    return data;
  },

  async getTopPendingUsers(teamId?: number, limit?: number): Promise<TopPendingUser[]> {
    const params: Record<string, string | number> = {};
    if (teamId) params.team_id = teamId;
    if (limit) params.limit = limit;
    const { data } = await api.get<TopPendingUser[]>("/dashboard/widgets/top_pending_users/", {
      params,
    });
    return data;
  },

  async getQueueHighlights(teamId?: number, limit?: number): Promise<QueueHighlight[]> {
    const params: Record<string, string | number> = {};
    if (teamId) params.team_id = teamId;
    if (limit) params.limit = limit;
    const { data } = await api.get<QueueHighlight[]>("/dashboard/widgets/queue_highlights/", {
      params,
    });
    return data;
  },

  async getMonthlyComparison(teamId?: number): Promise<MonthlyComparisonData> {
    const params: Record<string, string | number> = {};
    if (teamId) params.team_id = teamId;
    const { data } = await api.get<MonthlyComparisonData>(
      "/dashboard/widgets/monthly_comparison/",
      { params }
    );
    return data;
  },

  // Calendar Workspace methods
  async getMyWorkspaces(): Promise<UserCalendarPreference[]> {
    const { data } = await api.get<UserCalendarPreference[]>(
      "/dashboard/calendar-workspaces/my_workspaces/"
    );
    return data;
  },

  async getMyTeamsWorkspaces(): Promise<CalendarWorkspace[]> {
    const { data } = await api.get<CalendarWorkspace[]>(
      "/dashboard/calendar-workspaces/my_teams_workspaces/"
    );
    return data;
  },

  async getWorkspaceUsers(workspaceId: number): Promise<User[]> {
    const { data } = await api.get<User[]>(
      `/dashboard/calendar-workspaces/${workspaceId}/workspace_users/`
    );
    return data;
  },

  async addWorkspace(calendarId: number): Promise<UserCalendarPreference> {
    const { data } = await api.post<UserCalendarPreference>(
      "/dashboard/calendar-workspaces/add_workspace/",
      { calendar_id: calendarId }
    );
    return data;
  },

  async setActiveWorkspace(preferenceId: number): Promise<UserCalendarPreference> {
    const { data } = await api.post<UserCalendarPreference>(
      "/dashboard/calendar-workspaces/set_active_workspace/",
      { preference_id: preferenceId }
    );
    return data;
  },

  async getHolidays(params?: {
    calendar?: number | null;
    is_global?: boolean;
  }): Promise<PublicHoliday[]> {
    const { data } = await api.get<PublicHoliday[] | PaginatedResponse<PublicHoliday>>(
      "/dashboard/holidays/",
      { params }
    );
    return normalizeList(data);
  },

  // Dashboard Layout methods
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getDashboardLayout(dashboardType: string = "admin"): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await api.get<any>("/dashboard/preferences/", {
      params: { dashboard_type: dashboardType },
    });
    return data;
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async saveDashboardLayout(layout: any, dashboardType: string = "admin"): Promise<any> {
    // First check if preference exists
    try {
      const existing = await this.getDashboardLayout(dashboardType);
      if (existing && existing.results && existing.results.length > 0) {
        // Update existing preference
        const id = existing.results[0].id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await api.put<any>(`/dashboard/preferences/${id}/`, {
          dashboard_type: dashboardType,
          layout,
        });
        return data;
      }
    } catch {
      // Preference doesn't exist, create new one
    }

    // Create new preference
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await api.post<any>("/dashboard/preferences/", {
      dashboard_type: dashboardType,
      layout,
    });
    return data;
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async updateDashboardLayout(id: number, layout: any): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await api.put<any>(`/dashboard/preferences/${id}/`, { layout });
    return data;
  },

  async resetDashboardLayout(dashboardType: string = "admin"): Promise<void> {
    await api.delete("/dashboard/preferences/", { params: { dashboard_type: dashboardType } });
  },
};
