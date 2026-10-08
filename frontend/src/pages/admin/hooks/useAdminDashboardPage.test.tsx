import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAdminDashboardPage } from "./useAdminDashboardPage";

const dashboard = {
  layout: {
    version: 2,
    columns: 12,
    widgets: [{ id: "kpi-strip", position: { x: 0, y: 0 }, size: { w: 12, h: 2 } }],
  },
  isLoading: false,
  resetLayout: vi.fn(),
  addWidget: vi.fn(),
  removeWidget: vi.fn(),
};

vi.mock("@/context/DashboardContext", () => ({ useDashboard: () => dashboard }));
vi.mock("@/hooks/useAdminDashboardQueries", () => ({ useAdminDashboardQueries: () => ({}) }));

beforeEach(() => {
  vi.clearAllMocks();
  dashboard.isLoading = false;
});

describe("useAdminDashboardPage", () => {
  it("reports the widgets of the saved layout as active", () => {
    const { result } = renderHook(() => useAdminDashboardPage());
    expect(result.current.isWidgetActive("kpi-strip")).toBe(true);
    expect(result.current.isWidgetActive("approval-queue")).toBe(false);
    expect(result.current.activeWidgetIds).toEqual(["kpi-strip"]);
  });

  it("keeps every widget inactive while the saved layout is still loading", () => {
    dashboard.isLoading = true;
    const { result } = renderHook(() => useAdminDashboardPage());
    expect(result.current.isWidgetActive("kpi-strip")).toBe(false);
  });

  it("adds a widget that is off and removes one that is on", () => {
    const { result } = renderHook(() => useAdminDashboardPage());
    result.current.handleToggleWidget("approval-queue");
    expect(dashboard.addWidget).toHaveBeenCalledWith("approval-queue");
    result.current.handleToggleWidget("kpi-strip");
    expect(dashboard.removeWidget).toHaveBeenCalledWith("kpi-strip");
  });
});
