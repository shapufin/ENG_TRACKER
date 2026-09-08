import type { Role, Group } from "@/types";
import type { PluginMetadata } from "@/services/pluginService";

export type { PluginMetadata };

export interface PluginDetails {
  id: number;
  name: string;
  verbose_name: string;
  description: string;
  version: string;
  is_enabled: boolean;
  config: Record<string, unknown>;
  config_schema: Record<string, unknown>;
  permission_actions: string[];
  metadata: PluginMetadata;
}

export interface PluginPermissionRecord {
  id: number;
  plugin_name: string;
  action: string;
  is_public: boolean;
  allowed_roles: number[];
  allowed_role_codes?: string[];
  allowed_groups: number[];
}

export interface PluginConfigPermissionsProps {
  permissions: PluginPermissionRecord[];
  roles: Role[];
  groups?: Group[];
  isSuperuser?: boolean;
  permissionActions: string[];
  details: PluginDetails | null;
  onPermissionUpdate: (action: string, updates: Partial<PluginPermissionRecord>) => void;
  isPermissionUpdating?: (action: string) => boolean;
}

export interface PluginConfigSettingsProps {
  details: PluginDetails | null;
  config: Record<string, unknown>;
  onConfigChange: (key: string, value: unknown) => void;
}
