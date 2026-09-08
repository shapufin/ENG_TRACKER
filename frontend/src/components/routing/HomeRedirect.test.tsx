import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { HomeRedirect } from "./HomeRedirect";

vi.mock("@/context/PermissionContext", () => ({
  usePermissions: vi.fn(),
}));

import { usePermissions } from "@/context/PermissionContext";

const renderHome = () =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/dashboard" element={<div>Employee Dashboard</div>} />
        <Route path="/control-room/dashboard" element={<div>CR Dashboard</div>} />
        <Route path="/admin/users" element={<div>Admin Users</div>} />
      </Routes>
    </MemoryRouter>
  );

describe("HomeRedirect", () => {
  it("redirects CR user to /control-room/dashboard", () => {
    vi.mocked(usePermissions).mockReturnValue({
      isCRUser: true,
      isCRAdmin: false,
      isAdmin: false,
      isSuperuser: false,
      isHR: false,
      isTeamLeader: false,
    } as any);
    renderHome();
    expect(screen.getByText("CR Dashboard")).toBeInTheDocument();
  });

  it("redirects CR-only admin to the Control Room dashboard", () => {
    vi.mocked(usePermissions).mockReturnValue({
      isCRUser: false,
      isCRAdmin: true,
      isAdmin: false,
      isSuperuser: false,
      isHR: false,
      isTeamLeader: false,
    } as any);
    renderHome();
    expect(screen.getByText("CR Dashboard")).toBeInTheDocument();
  });

  it("redirects regular employee to /dashboard", () => {
    vi.mocked(usePermissions).mockReturnValue({
      isCRUser: false,
      isCRAdmin: false,
      isAdmin: false,
      isSuperuser: false,
      isHR: false,
      isTeamLeader: false,
    } as any);
    renderHome();
    expect(screen.getByText("Employee Dashboard")).toBeInTheDocument();
  });

  it("redirects superuser to /dashboard", () => {
    vi.mocked(usePermissions).mockReturnValue({
      isCRUser: false,
      isCRAdmin: false,
      isAdmin: false,
      isSuperuser: true,
      isHR: false,
      isTeamLeader: false,
    } as any);
    renderHome();
    expect(screen.getByText("Employee Dashboard")).toBeInTheDocument();
  });

  it("redirects null user (unauthenticated) to /dashboard", () => {
    vi.mocked(usePermissions).mockReturnValue({
      isCRUser: false,
      isCRAdmin: false,
      isAdmin: false,
      isSuperuser: false,
      isHR: false,
      isTeamLeader: false,
    } as any);
    renderHome();
    expect(screen.getByText("Employee Dashboard")).toBeInTheDocument();
  });
});
