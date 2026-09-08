import React, { createContext, useCallback, useEffect, useState } from "react";
import type { WidgetConfig } from "@/components/dashboard/widgetRegistry";
import {
  registerWidget,
  unregisterWidget,
  getAccessibleWidgets,
} from "@/components/dashboard/widgetRegistry";
import { usePluginPermissions } from "@/hooks/usePluginPermissions";

interface PluginWidgetContextValue {
  registerPluginWidget: (config: WidgetConfig) => void;
  unregisterPluginWidget: (id: string) => void;
  getAccessibleWidgets: () => WidgetConfig[];
  isReady: boolean;
}

const PluginWidgetContext = createContext<PluginWidgetContextValue | undefined>(undefined);

interface PluginWidgetProviderProps {
  children: React.ReactNode;
}

export const PluginWidgetProvider: React.FC<PluginWidgetProviderProps> = ({ children }) => {
  const { permissions, isLoading } = usePluginPermissions();
  const [isReady, setIsReady] = useState(false);

  // Convert permissions array to object format for widget filtering
  const userPermissions = React.useMemo(() => {
    const perms: Record<string, string[]> = {};
    permissions.forEach((plugin) => {
      perms[plugin.plugin_name] = plugin.permissions;
    });
    return perms;
  }, [permissions]);

  useEffect(() => {
    if (!isLoading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsReady(true);
    }
  }, [isLoading]);

  const registerPluginWidget = useCallback((config: WidgetConfig) => {
    registerWidget(config);
  }, []);

  const unregisterPluginWidget = useCallback((id: string) => {
    unregisterWidget(id);
  }, []);

  const getAccessibleWidgetsCallback = useCallback(() => {
    return getAccessibleWidgets(userPermissions);
  }, [userPermissions]);

  const value: PluginWidgetContextValue = {
    registerPluginWidget,
    unregisterPluginWidget,
    getAccessibleWidgets: getAccessibleWidgetsCallback,
    isReady,
  };

  return <PluginWidgetContext.Provider value={value}>{children}</PluginWidgetContext.Provider>;
};
