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

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: 1, username: "admin" } }),
}));

vi.mock("./hooks/useAdminDashboardPage", () => ({
  useAdminDashboardPage: () => ({
    resetLayout: vi.fn(),
    sensors: [],
    customizeModalOpen: false,
    setCustomizeModalOpen: vi.fn(),
    isWidgetActive: () => false,
    handleToggleWidget: vi.fn(),
    handleDragEnd: vi.fn(),
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
  it("renders the shared dashboard switcher with Admin active", () => {
    renderPage();

    expect(screen.getByText("Admin Dashboard")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Admin" })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("tab", { name: "Team Leader" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Personal" })).toBeInTheDocument();
  });
});
