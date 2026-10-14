import api from "@/lib/api";
import { extractResponseResults } from "@/lib/api-utils";
import type { PaginatedResponse } from "@/types";

export interface NotificationRecord {
  id: number;
  title: string;
  message: string;
  notification_type: "info" | "success" | "warning" | "error";
  is_read: boolean;
  link?: string;
  created_at: string;
}

export interface NotificationPreference {
  event_type: string;
  label: string;
  in_app_enabled: boolean;
  push_enabled: boolean;
  available: boolean;
  updated_at?: string;
}

/** One Settings-level notification type; a group key covers several event types. */
export interface NotificationTypeConfig {
  key: string;
  label: string;
  description: string;
  audience: "own" | "team" | "oversight";
  user_configurable: boolean;
  event_types: string[];
  enabled: boolean;
  partially_enabled: boolean;
}

export const notificationService = {
  getNotifications: async (): Promise<NotificationRecord[]> => {
    const response = await api.get<NotificationRecord[] | PaginatedResponse<NotificationRecord>>(
      "/plugins/notifications/notifications/"
    );
    return extractResponseResults(response);
  },

  /** One server page (newest first); `hasMore` mirrors the DRF `next` link. */
  getNotificationPage: async (
    page: number
  ): Promise<{ results: NotificationRecord[]; hasMore: boolean }> => {
    const response = await api.get<NotificationRecord[] | PaginatedResponse<NotificationRecord>>(
      "/plugins/notifications/notifications/",
      { params: { page } }
    );
    const data = response.data;
    return {
      results: extractResponseResults(response),
      hasMore: !Array.isArray(data) && Boolean(data.next),
    };
  },

  markAsRead: async (id: number): Promise<void> => {
    await api.post(`/plugins/notifications/notifications/${id}/mark_read/`);
  },

  markAllAsRead: async (): Promise<void> => {
    await api.post("/plugins/notifications/notifications/mark_all_read/");
  },

  getUnreadCount: async (): Promise<{ count: number }> => {
    const response = await api.get("/plugins/notifications/notifications/unread_count/");
    return response.data;
  },

  getPreferences: async (): Promise<NotificationPreference[]> => {
    const response = await api.get<NotificationPreference[]>(
      "/plugins/notifications/notifications/preferences/"
    );
    return response.data;
  },

  updatePreference: async (
    eventType: string,
    changes: Partial<Pick<NotificationPreference, "in_app_enabled" | "push_enabled">>
  ): Promise<NotificationPreference[]> => {
    // The backend's PATCH /preferences/ responds with the full, current
    // list of the user's preference rows (same shape as GET), not just the
    // one that changed.
    const response = await api.patch<NotificationPreference[]>(
      "/plugins/notifications/notifications/preferences/",
      { event_type: eventType, ...changes }
    );
    return response.data;
  },

  getEventTypeConfig: async (): Promise<NotificationTypeConfig[]> => {
    const response = await api.get<NotificationTypeConfig[]>(
      "/plugins/notifications/event-type-config/"
    );
    return response.data;
  },

  setEventTypeEnabled: async (key: string, enabled: boolean): Promise<NotificationTypeConfig> => {
    const response = await api.patch<NotificationTypeConfig>(
      `/plugins/notifications/event-type-config/${encodeURIComponent(key)}/`,
      { enabled }
    );
    return response.data;
  },
};
