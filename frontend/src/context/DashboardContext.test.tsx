import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { DashboardProvider, useDashboard } from "./DashboardContext";
import { dashboardService } from "@/services/dashboardService";

vi.mock("@/services/dashboardService", () => ({
  dashboardService: {
    getDashboardLayout: vi.fn(),
    saveDashboardLayout: vi.fn(),
    resetDashboardLayout: vi.fn(),
  },
}));

const Probe = () => {
  const { layout, isLoading } = useDashboard();
  return <div data-testid="ids">{isLoading ? "loading" : layout.widgets.map((w) => w.id).join(",")}</div>;
};

const saved = {
  columns: 4,
  widgets: [{ id: "org-headcount", position: { x: 0, y: 0 }, size: { w: 1, h: 1 } }],
};

describe("DashboardProvider layout restore", () => {
  beforeEach(() => vi.clearAllMocks());

  it("restores the saved layout from the paginated preferences response", async () => {
    vi.mocked(dashboardService.getDashboardLayout).mockResolvedValue({
      count: 1,
      results: [{ id: 1, dashboard_type: "admin", layout: saved }],
    });
    render(
      <DashboardProvider dashboardType="admin">
        <Probe />
      </DashboardProvider>
    );
    await waitFor(() => expect(screen.getByTestId("ids")).toHaveTextContent("org-headcount"));
    expect(screen.getByTestId("ids").textContent).toBe("org-headcount");
  });

  it("falls back to the default layout when nothing is saved", async () => {
    vi.mocked(dashboardService.getDashboardLayout).mockResolvedValue({ count: 0, results: [] });
    render(
      <DashboardProvider dashboardType="admin">
        <Probe />
      </DashboardProvider>
    );
    await waitFor(() => expect(screen.getByTestId("ids")).not.toHaveTextContent("loading"));
    expect(screen.getByTestId("ids").textContent).toContain("total-users");
  });
});
