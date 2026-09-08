import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { pluginService, type PluginMetadata } from "@/services/pluginService";
import { useAuth } from "@/context/AuthContext";
import { fetchActivePlugins } from "./pluginContextHelpers";

interface PluginContextType {
  activePlugins: PluginMetadata[];
  isLoading: boolean;
  getInjectedComponents: (slot: string) => { pluginName: string; componentName: string }[];
  refreshActivePlugins: () => Promise<void>;
}

const PluginContext = createContext<PluginContextType | undefined>(undefined);

export const PluginProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activePlugins, setActivePlugins] = useState<PluginMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { isAuthenticated, user, isLoading: authLoading } = useAuth();

  const refreshActivePlugins = useCallback(async () => {
    if (!isAuthenticated || !user || authLoading) {
      if (!authLoading) {
        setActivePlugins([]);
        setIsLoading(false);
      }
      return;
    }

    const { plugins, error } = await fetchActivePlugins({
      isAuthenticated,
      user,
      authLoading,
      getActiveMetadata: pluginService.getActiveMetadata,
    });

    if (error) {
      console.error("Failed to fetch active plugins metadata:", error);
      if (error.response?.status === 401) {
        console.warn("Authentication required for plugin metadata - user may need to log in");
      } else if (error.response?.status === 403) {
        console.warn("Permission denied for plugin metadata");
      } else {
        console.error("Unexpected error fetching plugin metadata:", error.message);
      }
    }
    setActivePlugins(plugins ?? []);
    setIsLoading(false);
  }, [isAuthenticated, user, authLoading]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshActivePlugins();
  }, [refreshActivePlugins]);

  const getInjectedComponents = useCallback(
    (slot: string) => {
      const components: { pluginName: string; componentName: string }[] = [];
      activePlugins.forEach((plugin) => {
        plugin.injection_slots.forEach((injection) => {
          if (injection.slot === slot) {
            components.push({
              pluginName: plugin.name,
              componentName: injection.component,
            });
          }
        });
      });
      return components;
    },
    [activePlugins]
  );

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
