import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { adminWidgetPlacement } from "@/components/dashboard/widgetRegistry";
import { AVAILABLE_WIDGETS } from "@/config/dashboardWidgets";
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

const withClient = (ui: React.ReactElement) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {ui}
  </QueryClientProvider>
);

describe("AdminDashboardWidgets recent-activity gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanView.mockReturnValue(true);
  });

  it("renders recent activity when audit_log view is permitted", () => {
    render(<MemoryRouter>{withClient(<AdminDashboardWidgets {...baseProps} />)}</MemoryRouter>);
    expect(screen.getByTestId("recent-activity-widget")).toBeInTheDocument();
  });

  it("hides recent activity when audit_log view is denied", () => {
    mockCanView.mockReturnValue(false);
    render(<MemoryRouter>{withClient(<AdminDashboardWidgets {...baseProps} />)}</MemoryRouter>);
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

  // The default layout leaves opt-in backup-status out; these tests want every widget placed.
  const everyWidget = {
    version: 2,
    columns: 12,
    widgets: AVAILABLE_WIDGETS.map((w) => adminWidgetPlacement(w.id)!),
  };

  const renderAll = (props: Partial<React.ComponentProps<typeof AdminDashboardWidgets>> = {}) =>
    render(
      <MemoryRouter>
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <AdminDashboardWidgets
            {...baseProps}
            isWidgetActive={() => true}
            layout={everyWidget}
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
    // Every widget is its own grid child; sections no longer own a grid.
    expect(container.querySelectorAll("[data-grid-cell]").length).toBe(cells.length);
    expect(container.querySelectorAll("[data-grid-mode]")).toHaveLength(1);
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

  it("orders cells by the saved layout (reading order, row then column)", async () => {
    const { container } = renderAll({
      isWidgetActive: (id) => id === "shortcuts" || id === "recent-activity",
      layout: {
        version: 2,
        columns: 12,
        widgets: [
          { id: "shortcuts", position: { x: 0, y: 9 }, size: { w: 12, h: 1 } },
          { id: "recent-activity", position: { x: 0, y: 0 }, size: { w: 4, h: 5 } },
        ],
      },
    });
    const ids = [...container.querySelectorAll<HTMLElement>("[data-grid-cell]")].map(
      (c) => c.dataset.gridCell
    );
    expect(ids).toEqual(["recent-activity", "shortcuts"]);
  });

  it("keeps exactly one [data-chart-section] per widget root, so PDF capture finds each card once", async () => {
    const { container } = renderAll({ editing: true });
    await screen.findByText("Coverage Gaps");
    await screen.findByRole("tab", { name: "Trend" });
    await screen.findByRole("tab", { name: "Roles" });
    const sections = [...container.querySelectorAll<HTMLElement>("[data-chart-section]")].map(
      (el) => el.dataset.chartSection
    );
    expect(new Set(sections).size).toBe(sections.length);
    for (const id of ["kpi-strip", "hours-trend", "approval-queue", "shortcuts"]) {
      expect(sections).toContain(id);
    }
    // Each section node sits inside its own grid cell, never wrapped by edit chrome.
    for (const el of container.querySelectorAll<HTMLElement>("[data-chart-section]")) {
      expect(el.closest("[data-grid-cell]")).not.toBeNull();
    }
  });

  it("keeps the trend period selector on its own when trend widgets are on without Hours", async () => {
    renderAll({ isWidgetActive: (id) => id === "leave-trend" });
    expect(await screen.findByRole("group", { name: "Trend period" })).toBeInTheDocument();
  });

  it("shows no selector row when the Hours widget carries it", async () => {
    renderAll({ isWidgetActive: (id) => id === "hours-trend" || id === "leave-trend" });
    await screen.findByRole("tab", { name: "Trend" });
    expect(screen.queryByRole("group", { name: "Trend period" })).not.toBeInTheDocument();
  });

  it("drops backup-status from the grid when the site has no backup data", async () => {
    vi.mocked(dashboardService.getAdminOverview).mockResolvedValue(makeOverview({ backup: null }));
    const { container } = renderAll({ isWidgetActive: (id) => id === "backup-status" });
    await vi.waitFor(() => expect(dashboardService.getAdminOverview).toHaveBeenCalled());
    await vi.waitFor(() =>
      expect(container.querySelector("[data-grid-cell='backup-status']")).toBeNull()
    );
  });

  it("shows an empty state with an Add widgets action when nothing is on", () => {
    const onAddWidgets = vi.fn();
    renderAll({ isWidgetActive: () => false, onAddWidgets });
    expect(screen.getByText("Your dashboard is empty")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add widgets" }));
    expect(onAddWidgets).toHaveBeenCalled();
  });

  it("does not claim the dashboard is empty while the layout loads", () => {
    renderAll({ isWidgetActive: () => false, isLoading: true });
    expect(screen.queryByText("Your dashboard is empty")).not.toBeInTheDocument();
  });

  it("explains an empty section instead of offering to add widgets", () => {
    renderAll({ isWidgetActive: () => false, sectionFiltered: true });
    expect(screen.getByText("No widgets in this section")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add widgets" })).not.toBeInTheDocument();
  });
});
