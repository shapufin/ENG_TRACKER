import React from "react";
import { AVAILABLE_WIDGETS } from "@/config/dashboardWidgets";

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

/** Stored dashboard layout (12-column grid, `version: 2`). */
export interface StoredDashboardLayout {
  version?: number;
  columns: number;
  widgets: Array<{
    id: string;
    position: { x: number; y: number };
    size: { w: number; h: number };
  }>;
}

/** Top-left cell of every admin widget on the 12-column grid, in reading order. */
const ADMIN_POSITIONS: Record<string, { x: number; y: number }> = {
  "kpi-strip": { x: 0, y: 0 },
  "coverage-gaps": { x: 0, y: 2 },
  "people-mix": { x: 4, y: 2 },
  "period-close": { x: 8, y: 2 },
  "backup-status": { x: 8, y: 5 },
  "approval-queue": { x: 0, y: 7 },
  "rejection-analysis": { x: 6, y: 7 },
  "hours-trend": { x: 0, y: 12 },
  "ot-by-client": { x: 8, y: 12 },
  "team-comparison": { x: 0, y: 17 },
  "leave-trend": { x: 6, y: 17 },
  "who-is-out": { x: 0, y: 22 },
  "recent-activity": { x: 4, y: 22 },
  shortcuts: { x: 0, y: 27 },
};

/** Default cell for a widget id (position from the table above, size from its config). */
export const adminWidgetPlacement = (id: string) => {
  const config = AVAILABLE_WIDGETS.find((w) => w.id === id);
  const position = ADMIN_POSITIONS[id];
  return config && position ? { id, position, size: { ...config.defaultSize } } : undefined;
};

/**
 * Default widget layout for the admin dashboard. `backup-status` is superuser-only and
 * opt-in, so it stays out of the default; it keeps a placement for when it is switched on.
 */
export const defaultAdminLayout: StoredDashboardLayout = {
  version: 2,
  columns: 12,
  widgets: AVAILABLE_WIDGETS.filter((w) => w.id !== "backup-status")
    .map((w) => adminWidgetPlacement(w.id)!)
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x),
};
