import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { DashboardPage } from "./DashboardPage";
import { usePermissions } from "@/context/PermissionContext";
import { useDashboardSelection } from "./hooks/useDashboardSelection";

vi.mock("@/hooks/useDashboardData", () => ({
  useDashboardData: () => ({
    overtimeLoading: false,
    standbyLoading: false,
    leaveLoading: false,
    overtimeData: null,
    standbyData: null,
    leaveData: null,
    personalOvertimeHours: 0,
    personalStandbyHours: 0,
    approvedLeaveDays: 0,
    pendingLeaveDays: 0,
    hrStats: null,
    monthlyData: null,
    statusBars: null,
    recentOvertimeTable: null,
    recentStandbyTable: null,
    recentActivity: null,
  }),
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock("@/context/PermissionContext", () => ({ usePermissions: vi.fn() }));
vi.mock("./hooks/useDashboardSelection", () => ({ useDashboardSelection: vi.fn() }));
vi.mock("./hooks/usePersonalDashboardItems", () => ({
  usePersonalDashboardItems: () => ({
    overtimeGoalProgress: 0,
    leaveGoalProgress: 0,
    upcomingLeaves: [],
    personalPendingItems: [],
    personalTimelineItems: [],
  }),
}));
vi.mock("./components/EmployeeDashboardPage", () => ({
  EmployeeDashboardPage: () => <div data-testid="employee" />,
}));
vi.mock("./components/HRDashboardPage", () => ({
  HRDashboardPage: () => <div data-testid="hr" />,
}));
vi.mock("./components/DashboardEmptyState", () => ({
  DashboardEmptyState: () => <div data-testid="empty" />,
}));
vi.mock("./TeamLeaderDashboard", () => ({ default: () => <div data-testid="tl" /> }));

// DashboardPage renders <Navigate> for the admin dashboard type, so every
// render needs a router; /admin is stubbed to observe the redirect target.
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/admin" element={<div data-testid="admin-dashboard" />} />
      </Routes>
    </MemoryRouter>
  );

describe("DashboardPage", () => {
  const defaultPermissions = {
    isAdmin: true,
    isTeamLeader: true,
    isHR: true,
    isSuperuser: false,
    isItalianTL: false,
    isAlbanianTL: false,
    isEmployee: false,
    canApprove: false,
    hasPermission: () => true,
    hasAnyPermission: () => true,
    isPrivileged: true,
    availableDashboards: ["employee", "team_leader", "hr"],
    primaryDashboard: "employee",
  };

  beforeEach(() => {
    vi.mocked(usePermissions).mockReturnValue(defaultPermissions as any);
    vi.mocked(useDashboardSelection).mockReturnValue({
      selectedDashboard: "employee",
      handleDashboardChange: vi.fn(),
    } as any);
  });

  it("renders employee dashboard", () => {
    renderPage();
    expect(screen.getByTestId("employee")).toBeInTheDocument();
  });

  it("renders hr dashboard", () => {
    vi.mocked(usePermissions).mockReturnValue({
      ...defaultPermissions,
      availableDashboards: ["hr"],
      primaryDashboard: "hr",
    } as any);
    vi.mocked(useDashboardSelection).mockReturnValue({
      selectedDashboard: "hr",
      handleDashboardChange: vi.fn(),
    } as any);
    renderPage();
    expect(screen.getByTestId("hr")).toBeInTheDocument();
  });

  it("renders team leader dashboard", async () => {
    vi.mocked(usePermissions).mockReturnValue({
      ...defaultPermissions,
      availableDashboards: ["team_leader"],
      primaryDashboard: "team_leader",
    } as any);
    vi.mocked(useDashboardSelection).mockReturnValue({
      selectedDashboard: "team_leader",
      handleDashboardChange: vi.fn(),
    } as any);
    renderPage();
    expect(await screen.findByTestId("tl")).toBeInTheDocument();
  });

  it("renders empty state when no dashboard is available", () => {
    vi.mocked(usePermissions).mockReturnValue({
      ...defaultPermissions,
      isTeamLeader: false,
      isHR: false,
      isAdmin: false,
      availableDashboards: [],
      primaryDashboard: "employee",
    } as any);
    vi.mocked(useDashboardSelection).mockReturnValue({
      selectedDashboard: "admin",
      handleDashboardChange: vi.fn(),
    } as any);
    renderPage();
    expect(screen.getByTestId("empty")).toBeInTheDocument();
  });

  // Admins landed on the "Select Dashboard" interstitial because DashboardPage
  // has no render branch for the "admin" dashboard type — auto-redirect to
  // the real admin dashboard instead (screenshot review 2026-09-07).
  it("redirects admins straight to /admin when the admin dashboard is selected", () => {
    vi.mocked(usePermissions).mockReturnValue({
      ...defaultPermissions,
      isAdmin: true,
      availableDashboards: ["admin", "employee"],
      primaryDashboard: "admin",
    } as any);
    vi.mocked(useDashboardSelection).mockReturnValue({
      selectedDashboard: "admin",
      handleDashboardChange: vi.fn(),
    } as any);
    renderPage();

    expect(screen.getByTestId("admin-dashboard")).toBeInTheDocument();
  });
});
