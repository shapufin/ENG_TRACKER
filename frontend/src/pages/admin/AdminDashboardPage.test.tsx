import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminDashboardPage } from "./AdminDashboardPage";

vi.mock("@/context/PermissionContext", () => ({
  usePermissions: () => ({
    availableDashboards: ["admin", "team_leader", "employee"],
    isAdmin: true,
    isHR: false,
    isTeamLeader: true,
    isSuperuser: false,
  }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, username: "admin" } }),
}));

vi.mock("./components/AdminInsightsStrip", () => ({ AdminInsightsStrip: () => null }));
vi.mock("./components/AdminDashboardFreshness", () => ({ AdminDashboardFreshness: () => null }));

vi.mock("./hooks/useAdminDashboardPage", () => ({
  useAdminDashboardPage: () => ({
    resetLayout: vi.fn(),
    customizeModalOpen: false,
    setCustomizeModalOpen: vi.fn(),
    isWidgetActive: () => false,
    handleToggleWidget: vi.fn(),
    activeWidgetIds: [],
    totalUsers: 0,
    totalTeams: 0,
    totalPending: 0,
    overtimeSummary: null,
    statusData: [],
    hoursData: [],
    auditLogs: [],
    statsLoading: false,
    auditLogsLoading: false,
  }),
}));

const renderPage = () => {
  const queryClient = new QueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AdminDashboardPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
};

describe("AdminDashboardPage header", () => {
  it("has no Personal/Admin dashboard switcher (C2)", () => {
    renderPage();

    expect(screen.getByText("Admin Dashboard")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Personal" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Team Leader" })).not.toBeInTheDocument();
  });

  it("keeps a single actions menu button next to the freshness control", () => {
    renderPage();

    const trigger = screen.getByRole("button", { name: "Dashboard actions" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    for (const name of [/presets/i, /export pdf/i, /reset to default/i, /customize/i]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });
});
