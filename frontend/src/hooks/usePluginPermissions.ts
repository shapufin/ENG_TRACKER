import { useQuery } from "@tanstack/react-query";
import { pluginService } from "@/services/pluginService";
import { useAuth } from "@/context/AuthContext";

/**
 * Hook to fetch and manage plugin permissions for the current user.
 *
 * Returns:
 * - permissions: List of plugins with user's permissions
 * - isLoading: Whether permissions are being loaded
 * - hasPermission: Function to check if user has specific permission
 * - canView: Function to check if user can view a plugin
 * - canManage: Function to check if user can manage a plugin
 */
export const usePluginPermissions = () => {
  const { isAuthenticated, user } = useAuth();

  const {
    data: permissions = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["plugin-permissions", user?.id ?? null],
    queryFn: () => pluginService.getUserPermissions(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: isAuthenticated, // Only fetch when authenticated
  });

  const hasPermission = (pluginName: string, action: string): boolean => {
    const plugin = permissions.find((p) => p.plugin_name === pluginName);
    if (!plugin) return false;
    return plugin.permissions.includes(action);
  };

  const canView = (pluginName: string): boolean => {
    return hasPermission(pluginName, "view");
  };

  const canManage = (pluginName: string): boolean => {
    return hasPermission(pluginName, "manage");
  };

  const canConfigure = (pluginName: string): boolean => {
    return hasPermission(pluginName, "configure");
  };

  const canExport = (pluginName: string): boolean => {
    return hasPermission(pluginName, "export");
  };

  return {
    permissions,
    isLoading,
    error,
    hasPermission,
    canView,
    canManage,
    canConfigure,
    canExport,
  };
};
