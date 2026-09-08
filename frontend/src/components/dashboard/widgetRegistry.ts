import React from "react";

export interface WidgetConfig {
  id: string;
  type: "metric" | "chart" | "activity" | "action" | "plugin";
  title: string;
  description?: string;
  component: React.ComponentType<WidgetProps>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defaultProps: Record<string, any>;
  gridSize: { w: number; h: number };
  removable: boolean;
  pluginName?: string; // For plugin widgets
  requiredPermission?: "view" | "manage" | "configure" | "export"; // For plugin widgets
}

export interface WidgetProps {
  id: string;
  title: string;
  onRemove?: () => void;
  isDragging?: boolean;
}

// Widget registry - will be populated with widget components
const widgetRegistry: Record<string, WidgetConfig> = {};

export const registerWidget = (config: WidgetConfig) => {
  widgetRegistry[config.id] = config;
};

export const unregisterWidget = (id: string) => {
  delete widgetRegistry[id];
};

export const getWidget = (id: string): WidgetConfig | undefined => {
  return widgetRegistry[id];
};

export const getAllWidgets = (): WidgetConfig[] => {
  return Object.values(widgetRegistry);
};

export const getWidgetsByType = (type: WidgetConfig["type"]): WidgetConfig[] => {
  return Object.values(widgetRegistry).filter((w) => w.type === type);
};

export const getPluginWidgets = (): WidgetConfig[] => {
  return Object.values(widgetRegistry).filter((w) => w.type === "plugin");
};

export const getWidgetsByPlugin = (pluginName: string): WidgetConfig[] => {
  return Object.values(widgetRegistry).filter((w) => w.pluginName === pluginName);
};

export const getAccessibleWidgets = (userPermissions: Record<string, string[]>): WidgetConfig[] => {
  return Object.values(widgetRegistry).filter((widget) => {
    // Non-plugin widgets are always accessible
    if (widget.type !== "plugin" || !widget.pluginName) {
      return true;
    }

    // For plugin widgets, check if user has required permission
    const pluginPerms = userPermissions[widget.pluginName] || [];
    const requiredPerm = widget.requiredPermission || "view";
    return pluginPerms.includes(requiredPerm);
  });
};

// Default widget layout for admin dashboard
export const defaultAdminLayout = {
  columns: 4,
  widgets: [
    { id: "total-users", position: { x: 0, y: 0 }, size: { w: 1, h: 1 } },
    { id: "total-teams", position: { x: 1, y: 0 }, size: { w: 1, h: 1 } },
    { id: "pending-approvals", position: { x: 2, y: 0 }, size: { w: 1, h: 1 } },
    { id: "overtime-hours", position: { x: 3, y: 0 }, size: { w: 1, h: 1 } },
    { id: "hours-overview", position: { x: 0, y: 1 }, size: { w: 2, h: 1 } },
    { id: "approval-status", position: { x: 2, y: 1 }, size: { w: 1, h: 1 } },
    { id: "recent-activity", position: { x: 3, y: 1 }, size: { w: 1, h: 1 } },
    { id: "users", position: { x: 0, y: 2 }, size: { w: 1, h: 1 } },
    { id: "teams", position: { x: 1, y: 2 }, size: { w: 1, h: 1 } },
    { id: "clients", position: { x: 2, y: 2 }, size: { w: 1, h: 1 } },
    { id: "permissions", position: { x: 3, y: 2 }, size: { w: 1, h: 1 } },
    { id: "calendar-mgmt", position: { x: 0, y: 3 }, size: { w: 1, h: 1 } },
    { id: "reports", position: { x: 1, y: 3 }, size: { w: 1, h: 1 } },
    { id: "holiday-balances", position: { x: 2, y: 3 }, size: { w: 1, h: 1 } },
  ],
};
