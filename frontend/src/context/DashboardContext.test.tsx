import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
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
  return (
    <div data-testid="ids">{isLoading ? "loading" : layout.widgets.map((w) => w.id).join(",")}</div>
  );
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

describe("DashboardProvider rapid toggles", () => {
  beforeEach(() => vi.clearAllMocks());

  const Toggler = () => {
    const { addWidget, removeWidget, isLoading } = useDashboard();
    return (
      <div>
        <span data-testid="loading">{String(isLoading)}</span>
        <button onClick={() => ["a", "b", "c"].forEach(addWidget)}>add three</button>
        <button onClick={() => removeWidget("b")}>remove b</button>
      </div>
    );
  };

  it("saves one at a time, in order, and the last save has every widget", async () => {
    vi.mocked(dashboardService.getDashboardLayout).mockResolvedValue({ count: 0, results: [] });
    let inFlight = 0;
    let maxInFlight = 0;
    vi.mocked(dashboardService.saveDashboardLayout).mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });
    render(
      <DashboardProvider dashboardType="admin">
        <Toggler />
      </DashboardProvider>
    );
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    act(() => screen.getByText("add three").click());
    await waitFor(() => expect(dashboardService.saveDashboardLayout).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(inFlight).toBe(0));
    expect(maxInFlight).toBe(1);
    const calls = vi.mocked(dashboardService.saveDashboardLayout).mock.calls;
    const ids = (i: number) => calls[i][0].widgets.map((w: { id: string }) => w.id);
    expect(ids(2).slice(-3)).toEqual(["a", "b", "c"]);
    expect(ids(0)).not.toContain("c");
  });

  it("persists a removal made right after additions", async () => {
    vi.mocked(dashboardService.getDashboardLayout).mockResolvedValue({ count: 0, results: [] });
    vi.mocked(dashboardService.saveDashboardLayout).mockResolvedValue(undefined);
    render(
      <DashboardProvider dashboardType="admin">
        <Toggler />
      </DashboardProvider>
    );
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    act(() => {
      screen.getByText("add three").click();
      screen.getByText("remove b").click();
    });
    await waitFor(() => expect(dashboardService.saveDashboardLayout).toHaveBeenCalledTimes(4));
    const last = vi.mocked(dashboardService.saveDashboardLayout).mock.calls[3][0];
    const ids = last.widgets.map((w: { id: string }) => w.id);
    expect(ids).toContain("a");
    expect(ids).toContain("c");
    expect(ids).not.toContain("b");
  });
});
