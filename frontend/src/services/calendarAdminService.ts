// fallow-ignore-file unused-type
import api from "@/lib/api";
import type { CalendarWorkspace, PublicHoliday, PaginatedResponse } from "@/types";

const normalizeCollection = <T>(payload: T[] | PaginatedResponse<T>): T[] => {
  if (Array.isArray(payload)) {
    return payload;
  }
  return payload?.results ?? [];
};

export interface CalendarWorkspacePayload {
  name: string;
  code: string;
  description?: string;
  color?: string;
  icon?: string;
  team?: number | null;
  is_public?: boolean;
  default_view?: string;
  show_overtime?: boolean;
  show_standby?: boolean;
  show_vacation?: boolean;
  show_holidays?: boolean;
}

export interface HolidayPayload {
  name: string;
  date: string;
  country_code?: string;
  is_global?: boolean;
  description?: string;
  calendar?: number | null;
}

export const calendarAdminService = {
  async listWorkspaces(): Promise<CalendarWorkspace[]> {
    const { data } = await api.get<CalendarWorkspace[] | PaginatedResponse<CalendarWorkspace>>(
      "/dashboard/calendar-workspaces/"
    );
    return normalizeCollection(data);
  },

  async createWorkspace(payload: CalendarWorkspacePayload): Promise<CalendarWorkspace> {
    const { data } = await api.post<CalendarWorkspace>("/dashboard/calendar-workspaces/", payload);
    return data;
  },

  async updateWorkspace(
    id: number,
    payload: Partial<CalendarWorkspacePayload>
  ): Promise<CalendarWorkspace> {
    const { data } = await api.put<CalendarWorkspace>(
      `/dashboard/calendar-workspaces/${id}/`,
      payload
    );
    return data;
  },

  async deleteWorkspace(id: number): Promise<void> {
    await api.delete(`/dashboard/calendar-workspaces/${id}/`);
  },

  async addAllowedUser(workspaceId: number, userId: number): Promise<void> {
    await api.post(`/dashboard/calendar-workspaces/${workspaceId}/add_allowed_user/`, {
      user_id: userId,
    });
  },

  async removeAllowedUser(workspaceId: number, userId: number): Promise<void> {
    await api.post(`/dashboard/calendar-workspaces/${workspaceId}/remove_allowed_user/`, {
      user_id: userId,
    });
  },

  async addAllowedGroup(workspaceId: number, groupId: number): Promise<void> {
    await api.post(`/dashboard/calendar-workspaces/${workspaceId}/add_allowed_group/`, {
      group_id: groupId,
    });
  },

  async removeAllowedGroup(workspaceId: number, groupId: number): Promise<void> {
    await api.post(`/dashboard/calendar-workspaces/${workspaceId}/remove_allowed_group/`, {
      group_id: groupId,
    });
  },

  async listHolidays(params?: { calendar?: number }): Promise<PublicHoliday[]> {
    const { data } = await api.get<PublicHoliday[] | PaginatedResponse<PublicHoliday>>(
      "/dashboard/holidays/",
      { params }
    );
    return normalizeCollection(data);
  },

  async createHoliday(payload: HolidayPayload): Promise<PublicHoliday> {
    const { data } = await api.post<PublicHoliday>("/dashboard/holidays/", payload);
    return data;
  },

  async updateHoliday(id: number, payload: Partial<HolidayPayload>): Promise<PublicHoliday> {
    const { data } = await api.put<PublicHoliday>(`/dashboard/holidays/${id}/`, payload);
    return data;
  },

  async deleteHoliday(id: number): Promise<void> {
    await api.delete(`/dashboard/holidays/${id}/`);
  },
};
