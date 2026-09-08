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

export const notificationService = {
  getNotifications: async (): Promise<NotificationRecord[]> => {
    const response = await api.get<NotificationRecord[] | PaginatedResponse<NotificationRecord>>(
      "/plugins/notifications/notifications/"
    );
    return extractResponseResults(response);
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
    changes: Pick<NotificationPreference, "in_app_enabled" | "push_enabled">
  ): Promise<NotificationPreference> => {
    const response = await api.patch<NotificationPreference>(
      "/plugins/notifications/notifications/preferences/",
      { event_type: eventType, ...changes }
    );
    return response.data;
  },
};
