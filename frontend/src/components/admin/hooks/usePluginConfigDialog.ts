import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { permissionService } from "@/services/permissionService";
import { usePlugins } from "@/context/PluginContext";
import { usePermissions } from "@/context/PermissionContext";
import type { PluginRecord } from "@/services/pluginService";
import type { PluginDetails, PluginPermissionRecord } from "../pluginConfigTypes";
import type { Role, Group } from "@/types";

export const usePluginConfigDialog = (
  plugin: PluginRecord | null,
  open: boolean,
  onConfigSaved: () => void,
  onOpenChange: (open: boolean) => void
) => {
  const [details, setDetails] = useState<PluginDetails | null>(null);
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [permissions, setPermissions] = useState<PluginPermissionRecord[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [permissionActions, setPermissionActions] = useState<string[]>(["view", "manage"]);
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(false);
  const [updatingPermissions, setUpdatingPermissions] = useState<{
    pluginId: PluginRecord["id"] | null;
    actions: Set<string>;
  }>({ pluginId: null, actions: new Set() });
  const requestGeneration = useRef(0);
  const queryClient = useQueryClient();
  const { refreshActivePlugins } = usePlugins();
  const { isSuperuser } = usePermissions();

  useEffect(() => {
    if (!open || !plugin) return;
    requestGeneration.current += 1;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const response = await api.get(`plugins/management/${plugin.id}/details/`);
        if (cancelled) return;
        setDetails(response.data);
        setPermissionActions(response.data.permission_actions || ["view", "manage"]);
        setConfig(response.data.config || {});
      } catch {
        toast.error("Failed to load plugin details");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    (async () => {
      setIsPermissionsLoading(true);
      try {
        const [rolesData, groupsData, permsResponse] = await Promise.all([
          permissionService.getRoles({ page_size: 100 }),
          permissionService.getAllGroups(),
          api.get(`plugins/management/${plugin.id}/permissions/`),
        ]);
        if (cancelled) return;
        setRoles(rolesData.results || []);
        setGroups(groupsData);
        setPermissions(permsResponse.data);
      } catch (_err) {
        console.error("Failed to load permissions data:", _err);
        toast.error("Failed to load permissions settings");
      } finally {
        if (!cancelled) setIsPermissionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      requestGeneration.current += 1;
    };
  }, [open, plugin]);

  const handlePermissionUpdate = async (
    action: string,
    updates: Partial<PluginPermissionRecord>
  ) => {
    if (!plugin) return;
    const pluginId = plugin.id;
    if (updatingPermissions.pluginId === pluginId && updatingPermissions.actions.has(action))
      return;
    const generation = requestGeneration.current;
    const isCurrentRequest = () =>
      requestGeneration.current === generation && plugin?.id === pluginId;

    setUpdatingPermissions((prev) => ({
      pluginId,
      actions: new Set(prev.pluginId === pluginId ? prev.actions : []).add(action),
    }));
    try {
      const response = await api.post(`plugins/management/${pluginId}/permissions/`, {
        action,
        ...updates,
      });
      if (!isCurrentRequest()) return;

      const updatedPerm = response.data;
      setPermissions((prev) => {
        const index = prev.findIndex((p) => p.action === action);
        if (index !== -1) {
          const newPerms = [...prev];
          newPerms[index] = updatedPerm;
          return newPerms;
        }
        return [...prev, updatedPerm];
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["plugin-permissions"] }),
        refreshActivePlugins(),
      ]);
      if (isCurrentRequest()) toast.success(`Permission for '${action}' updated`);
    } catch {
      if (isCurrentRequest()) toast.error("Failed to update permission");
    } finally {
      if (isCurrentRequest()) {
        setUpdatingPermissions((prev) => {
          if (prev.pluginId !== pluginId) return prev;
          const actions = new Set(prev.actions);
          actions.delete(action);
          return { pluginId, actions };
        });
      }
    }
  };

  const handleConfigChange = (key: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  // fallow-ignore-next-line complexity
  const handleSave = async () => {
    if (!plugin) return;
    setIsSaving(true);
    try {
      await api.post(`plugins/management/${plugin.id}/configure/`, { config });
      toast.success("Plugin configuration saved");
      onConfigSaved();
      onOpenChange(false);
    } catch (error: unknown) {
      const errorMsg =
        (error as { response?: { data?: { error?: string } }; message?: string }).response?.data
          ?.error ||
        (error as { message?: string }).message ||
        "Failed to save configuration";
      toast.error(errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  return {
    details,
    config,
    isLoading,
    isSaving,
    permissions,
    roles,
    groups,
    isSuperuser,
    permissionActions,
    isPermissionsLoading,
    isPermissionUpdating: (action: string) =>
      updatingPermissions.pluginId === plugin?.id && updatingPermissions.actions.has(action),
    handleConfigChange,
    handlePermissionUpdate,
    handleSave,
  };
};
