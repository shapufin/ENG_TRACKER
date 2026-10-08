import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { dashboardService } from "@/services/dashboardService";
import { AdminDashboardWidgets } from "./AdminDashboardWidgets";
import { makeOverview, makePeople, makeTrends } from "./dashboard-widgets/adminFixtures";

// Audit 2026-09-07: the recent-activity widget rendered (and its audit_log
// query fired) for users without the audit_log plugin view permission —
// HR got a 403 + error toast on every admin dashboard visit.
const mockCanView = vi.fn(() => true);
vi.mock("@/hooks/usePluginPermissions", () => ({
  usePluginPermissions: () => ({ canView: mockCanView }),
}));

vi.mock("@/services/dashboardService", () => ({
  dashboardService: {
    getAdminOverview: vi.fn(),
    getAdminTrends: vi.fn(),
    getAdminPeople: vi.fn(),
  },
}));
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 600, height: 240 }}>{children}</div>
    ),
  };
});

const baseProps = {
  isWidgetActive: (id: string) => id === "recent-activity",
  totalUsers: 1,
  totalTeams: 1,
  totalPending: 0,
  overtimeSummary: null,
  hoursData: [],
  statusData: [],
  auditLogs: [],
  statsLoading: false,
  auditLogsLoading: false,
};

describe("AdminDashboardWidgets recent-activity gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanView.mockReturnValue(true);
  });

  it("renders recent activity when audit_log view is permitted", () => {
    render(
      <MemoryRouter>
        <AdminDashboardWidgets {...baseProps} />
      </MemoryRouter>
    );
    expect(screen.getByTestId("recent-activity-widget")).toBeInTheDocument();
  });

  it("hides recent activity when audit_log view is denied", () => {
    mockCanView.mockReturnValue(false);
    render(
      <MemoryRouter>
        <AdminDashboardWidgets {...baseProps} />
      </MemoryRouter>
    );
    expect(screen.queryByTestId("recent-activity-widget")).not.toBeInTheDocument();
  });
});

describe("AdminDashboardWidgets single grid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanView.mockReturnValue(true);
    vi.mocked(dashboardService.getAdminOverview).mockResolvedValue(makeOverview());
    vi.mocked(dashboardService.getAdminTrends).mockResolvedValue(makeTrends());
    vi.mocked(dashboardService.getAdminPeople).mockResolvedValue(makePeople());
  });

  const renderAll = (props: Partial<React.ComponentProps<typeof AdminDashboardWidgets>> = {}) =>
    render(
      <MemoryRouter>
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <AdminDashboardWidgets
            {...baseProps}
            isWidgetActive={() => true}
            isSuperuser
            {...props}
          />
        </QueryClientProvider>
      </MemoryRouter>
    );

  it("renders every widget as a cell of one 12-column grid", async () => {
    const { container } = renderAll();
    await screen.findByRole("tab", { name: "Roles" });
    await screen.findByRole("tab", { name: "Trend" });
    await screen.findByText("Coverage Gaps");
    const cells = [...container.querySelectorAll("[data-grid-cell]")].map(
      (c) => (c as HTMLElement).dataset.gridCell
    );
    expect(cells.sort()).toEqual(
      [
        "approval-queue",
        "backup-status",
        "coverage-gaps",
        "hours-trend",
        "kpi-strip",
        "leave-trend",
        "ot-by-client",
        "people-mix",
        "period-close",
        "recent-activity",
        "rejection-analysis",
        "shortcuts",
        "team-comparison",
        "who-is-out",
      ].sort()
    );
    // One grid, no per-section grids.
    expect(container.querySelectorAll('[class~="lg:grid-cols-12"]')).toHaveLength(1);
    expect(container.querySelectorAll("[data-grid-cell]").length).toBe(cells.length);
  });

  it("makes one request per aggregate for the whole dashboard", async () => {
    renderAll();
    await screen.findByText("Coverage Gaps");
    await screen.findByRole("tab", { name: "Roles" });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Aging" }));
    fireEvent.mouseDown(screen.getAllByRole("tab", { name: "Speed" })[0]);
    await vi.waitFor(() => expect(dashboardService.getAdminPeople).toHaveBeenCalled());
    expect(dashboardService.getAdminOverview).toHaveBeenCalledTimes(1);
    expect(dashboardService.getAdminTrends).toHaveBeenCalledTimes(1);
    expect(dashboardService.getAdminPeople).toHaveBeenCalledTimes(1);
  });

  it("fetches nothing for aggregates whose widgets are off", () => {
    renderAll({ isWidgetActive: (id) => id === "shortcuts" || id === "approval-queue" });
    expect(dashboardService.getAdminOverview).not.toHaveBeenCalled();
    expect(dashboardService.getAdminTrends).not.toHaveBeenCalled();
    expect(dashboardService.getAdminPeople).not.toHaveBeenCalled();
    expect(screen.getByRole("navigation", { name: "Admin shortcuts" })).toBeInTheDocument();
  });

  it("keeps backup-status off the grid for non-superusers", async () => {
    const { container } = renderAll({ isSuperuser: false });
    await screen.findByText("Coverage Gaps");
    expect(container.querySelector("[data-grid-cell='backup-status']")).toBeNull();
  });

  it("orders cells by the saved layout", async () => {
    const { container } = renderAll({
      isWidgetActive: (id) => id === "shortcuts" || id === "recent-activity",
      order: ["shortcuts", "recent-activity"],
    });
    const cell = (id: string) => container.querySelector<HTMLElement>(`[data-grid-cell='${id}']`)!;
    expect(cell("shortcuts").style.order).toBe("0");
    expect(cell("recent-activity").style.order).toBe("1");
  });
});
