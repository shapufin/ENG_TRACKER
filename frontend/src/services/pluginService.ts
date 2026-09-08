import api from "@/lib/api";
import { extractResponseResults } from "@/lib/api-utils";
import type { PaginatedResponse } from "@/types";

export interface PluginMetadata {
  name: string;
  verbose_name: string;
  description: string;
  version: string;
  routes: {
    path: string;
    component: string;
    layout: "app" | "admin";
  }[];
  injection_slots: {
    slot: string;
    component: string;
  }[];
}

export interface PluginRecord {
  id: number;
  name: string;
  verbose_name: string;
  description: string;
  version: string;
  is_enabled: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any;
  created_at: string;
  updated_at: string;
  user_permissions?: string[];
}

export interface PluginPermissionInfo {
  plugin_name: string;
  verbose_name: string;
  permissions: string[];
  has_access: boolean;
}

export const pluginService = {
  getPlugins: async (): Promise<PluginRecord[]> => {
    const response = await api.get<PluginRecord[] | PaginatedResponse<PluginRecord>>(
      "/plugins/management/"
    );
    return extractResponseResults(response);
  },

  discoverPlugins: async (): Promise<PluginRecord[]> => {
    const response = await api.get<PluginRecord[] | PaginatedResponse<PluginRecord>>(
      "/plugins/management/discover/"
    );
    return extractResponseResults(response);
  },

  togglePlugin: async (id: number): Promise<{ is_enabled: boolean }> => {
    const response = await api.post(`/plugins/management/${id}/toggle/`);
    return response.data;
  },

  initializePlugin: async (
    id: number
  ): Promise<{ status: string; message?: string; error?: string }> => {
    try {
      const response = await api.post(`/plugins/management/${id}/activate/`);
      return response.data;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      // Return detailed error message
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error, { cause: error });
      }
      throw error;
    }
  },

  getActiveMetadata: async (): Promise<PluginMetadata[]> => {
    const response = await api.get("/plugins/management/active_metadata/");
    return response.data;
  },

  getUserPermissions: async (): Promise<PluginPermissionInfo[]> => {
    const response = await api.get("/plugins/management/user_permissions/");
    return response.data;
  },

  checkPermission: async (
    id: number,
    action: string = "view"
  ): Promise<{ has_permission: boolean; reason: string }> => {
    const response = await api.get(`/plugins/management/${id}/check_permission/`, {
      params: { action },
    });
    return response.data;
  },
};
