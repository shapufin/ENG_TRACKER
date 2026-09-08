import { describe, it, expect, vi } from "vitest";
import {
  registerWidget,
  unregisterWidget,
  getWidget,
  getAllWidgets,
  getWidgetsByType,
  getPluginWidgets,
  getWidgetsByPlugin,
  getAccessibleWidgets,
  type WidgetConfig,
} from "./widgetRegistry";

const baseWidget: WidgetConfig = {
  id: "test",
  type: "metric",
  title: "Test",
  component: vi.fn() as any,
  defaultProps: {},
  gridSize: { w: 1, h: 1 },
  removable: true,
};

describe("widgetRegistry", () => {
  it("registers and retrieves a widget", () => {
    registerWidget(baseWidget);
    expect(getWidget("test")).toEqual(baseWidget);
  });

  it("unregisters a widget", () => {
    registerWidget(baseWidget);
    unregisterWidget("test");
    expect(getWidget("test")).toBeUndefined();
  });

  it("returns all widgets", () => {
    registerWidget({ ...baseWidget, id: "a" });
    registerWidget({ ...baseWidget, id: "b" });
    expect(getAllWidgets().length).toBeGreaterThanOrEqual(2);
  });

  it("filters by type", () => {
    registerWidget({ ...baseWidget, id: "chart-1", type: "chart" });
    const charts = getWidgetsByType("chart");
    expect(charts.some((w) => w.id === "chart-1")).toBe(true);
  });

  it("returns plugin widgets", () => {
    registerWidget({ ...baseWidget, id: "plugin-1", type: "plugin", pluginName: "plugin-a" });
    expect(getPluginWidgets().some((w) => w.id === "plugin-1")).toBe(true);
  });

  it("filters by plugin name", () => {
    registerWidget({ ...baseWidget, id: "plugin-2", type: "plugin", pluginName: "plugin-b" });
    expect(getWidgetsByPlugin("plugin-b").map((w) => w.id)).toContain("plugin-2");
  });

  it("returns accessible widgets based on permissions", () => {
    registerWidget({
      ...baseWidget,
      id: "plugin-3",
      type: "plugin",
      pluginName: "plugin-c",
      requiredPermission: "manage",
    });
    registerWidget({ ...baseWidget, id: "metric-1", type: "metric" });
    const accessible = getAccessibleWidgets({ "plugin-c": ["view"] });
    expect(accessible.some((w) => w.id === "metric-1")).toBe(true);
    expect(accessible.some((w) => w.id === "plugin-3")).toBe(false);
  });

  it("returns plugin widget when user has permission", () => {
    registerWidget({
      ...baseWidget,
      id: "plugin-4",
      type: "plugin",
      pluginName: "plugin-d",
      requiredPermission: "configure",
    });
    const accessible = getAccessibleWidgets({ "plugin-d": ["configure"] });
    expect(accessible.some((w) => w.id === "plugin-4")).toBe(true);
  });
});
