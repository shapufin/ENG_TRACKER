import React, { createContext, useContext, useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { pluginService, type PluginMetadata } from "@/services/pluginService";
import { useAuth } from "@/context/AuthContext";

interface PluginContextType {
  activePlugins: PluginMetadata[];
  isLoading: boolean;
  getInjectedComponents: (
    slot: string
  ) => { pluginName: string; componentName: string; section?: string }[];
  refreshActivePlugins: () => Promise<void>;
}

const PluginContext = createContext<PluginContextType | undefined>(undefined);

export const PluginProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user, isLoading: authLoading } = useAuth();
  const enabled = isAuthenticated && !!user && !authLoading;

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["plugins", "active-metadata", user?.id ?? null],
    queryFn: () => pluginService.getActiveMetadata(),
    enabled,
    // Every other query in this app keeps refetchOnWindowFocus: false (the
    // QueryProvider default; see lib/queryOptions.ts and useDashboardData.ts)
    // to avoid refetch storms on tab-switch. This one is the deliberate
    // exception: the active plugin list drives the entire sidebar/admin-panel
    // injection surface, and restarting the backend dev server (enabling a
    // plugin, adding an injection_slot) never touches the browser tab, so
    // nothing else would ever refetch it — the sidebar link would look
    // "removed" until a manual hard refresh. Refetching on focus makes it
    // self-heal the moment the tab is looked at again.
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!error) return;
    console.error("Failed to fetch active plugins metadata:", error);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = error as any;
    if (err?.response?.status === 401) {
      console.warn("Authentication required for plugin metadata - user may need to log in");
    } else if (err?.response?.status === 403) {
      console.warn("Permission denied for plugin metadata");
    } else {
      console.error("Unexpected error fetching plugin metadata:", err?.message);
    }
  }, [error]);

  const activePlugins = useMemo(() => data ?? [], [data]);
  const isLoading = authLoading || (enabled && isPending);

  const getInjectedComponents = useCallback(
    (slot: string) => {
      const components: { pluginName: string; componentName: string; section?: string }[] = [];
      activePlugins.forEach((plugin) => {
        plugin.injection_slots.forEach((injection) => {
          if (injection.slot === slot) {
            components.push({
              pluginName: plugin.name,
              componentName: injection.component,
              section: injection.section,
            });
          }
        });
      });
      return components;
    },
    [activePlugins]
  );

  const refreshActivePlugins = async () => {
    await refetch();
  };

  return (
    <PluginContext.Provider
      value={{ activePlugins, isLoading, getInjectedComponents, refreshActivePlugins }}
    >
      {children}
    </PluginContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const usePlugins = () => {
  const context = useContext(PluginContext);
  if (context === undefined) {
    throw new Error("usePlugins must be used within a PluginProvider");
  }
  return context;
};
