import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AdminShell } from "./AdminShell";
import type { PermissionContextType } from "@/context/permission-context-base";

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { username: "u1", first_name: "U", last_name: "One" } }),
}));
vi.mock("@/context/PermissionContext", () => ({
  usePermissions: vi.fn(),
}));
vi.mock("@/context/PluginContext", () => ({
  usePlugins: () => ({ activePlugins: [], isLoading: false }),
}));
vi.mock("@/hooks/useLogout", () => ({ useLogout: () => vi.fn() }));
vi.mock("./AdminSidebar", () => ({
  AdminSidebar: () => <div data-testid="admin-sidebar" />,
}));
vi.mock("./MobileOverlay", () => ({
  MobileOverlay: () => <div data-testid="mobile-overlay" />,
}));
vi.mock("./MainContentTransition", () => ({
  MainContentTransition: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="main-content">{children}</div>
  ),
}));
vi.mock("./hooks/useAdminNavItems", () => ({
  useAdminNavItems: () => [],
}));

import { usePermissions } from "@/context/PermissionContext";

const basePerms: PermissionContextType = {
  isTeamLeader: false,
  isItalianTL: false,
  isAlbanianTL: false,
  isHR: false,
  isAdmin: false,
  isSuperuser: false,
  isCRAdmin: false,
  isCRUser: false,
  isEmployee: false,
  canApprove: false,
  canManageTeam: false,
  canViewTeamData: false,
  canViewAllData: false,
  canViewWorkspaceMembers: false,
  availableDashboards: [],
  primaryDashboard: "employee",
};

const renderShell = (initialPath: string) =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/admin/*" element={<AdminShell />} />
        <Route path="/admin/users" element={<div>Users Page</div>} />
      </Routes>
    </MemoryRouter>
  );

describe("AdminShell CR admin routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects CR-only admin away from disallowed admin routes", async () => {
    vi.mocked(usePermissions).mockReturnValue({ ...basePerms, isCRAdmin: true });

    renderShell("/admin/overtime-logs");

    await waitFor(() => {
      expect(screen.getByText("Users Page")).toBeInTheDocument();
    });
  });

  it("allows CR-only admin to stay on /admin/users", async () => {
    vi.mocked(usePermissions).mockReturnValue({ ...basePerms, isCRAdmin: true });

    renderShell("/admin/users");

    await waitFor(() => {
      expect(screen.getByText("Users Page")).toBeInTheDocument();
    });
  });

  it("allows CR-only admin to stay on /admin/control-room/access", async () => {
    vi.mocked(usePermissions).mockReturnValue({ ...basePerms, isCRAdmin: true });

    renderShell("/admin/control-room/access");

    await waitFor(() => {
      expect(screen.getByTestId("admin-sidebar")).toBeInTheDocument();
    });
  });

  it("does NOT redirect multi-role CR admin (CR + TL) from disallowed routes", async () => {
    vi.mocked(usePermissions).mockReturnValue({
      ...basePerms,
      isCRAdmin: true,
      isTeamLeader: true,
    });

    renderShell("/admin/overtime-logs");

    await waitFor(() => {
      expect(screen.getByTestId("admin-sidebar")).toBeInTheDocument();
    });
    expect(screen.queryByText("Users Page")).not.toBeInTheDocument();
  });

  it("does NOT redirect a regular admin from any admin route", async () => {
    vi.mocked(usePermissions).mockReturnValue({ ...basePerms, isAdmin: true });

    renderShell("/admin/overtime-logs");

    await waitFor(() => {
      expect(screen.getByTestId("admin-sidebar")).toBeInTheDocument();
    });
    expect(screen.queryByText("Users Page")).not.toBeInTheDocument();
  });
});
