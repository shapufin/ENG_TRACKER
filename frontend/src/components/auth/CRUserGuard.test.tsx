import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { CRUserGuard } from "./CRUserGuard";

vi.mock("@/context/PermissionContext", () => ({
  usePermissions: vi.fn(),
}));

import { usePermissions } from "@/context/PermissionContext";

const renderWithRoute = () =>
  render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route element={<CRUserGuard />}>
          <Route path="/dashboard" element={<div>Employee Dashboard</div>} />
        </Route>
        <Route path="/control-room/dashboard" element={<div>CR Dashboard</div>} />
      </Routes>
    </MemoryRouter>
  );

describe("CRUserGuard", () => {
  it("redirects CR-only user to /control-room/dashboard", () => {
    vi.mocked(usePermissions).mockReturnValue({
      isCRUser: true,
      isCRAdmin: false,
      isAdmin: false,
      isSuperuser: false,
      isHR: false,
      isTeamLeader: false,
    } as any);
    renderWithRoute();
    expect(screen.getByText("CR Dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Employee Dashboard")).not.toBeInTheDocument();
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
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route element={<CRUserGuard />}>
            <Route path="/dashboard" element={<div>Employee Dashboard</div>} />
          </Route>
          <Route path="/control-room/dashboard" element={<div>CR Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText("CR Dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Employee Dashboard")).not.toBeInTheDocument();
  });

  it("allows regular employee through", () => {
    vi.mocked(usePermissions).mockReturnValue({
      isCRUser: false,
      isCRAdmin: false,
      isAdmin: false,
      isSuperuser: false,
      isHR: false,
      isTeamLeader: false,
    } as any);
    renderWithRoute();
    expect(screen.getByText("Employee Dashboard")).toBeInTheDocument();
  });

  it("allows admin through", () => {
    vi.mocked(usePermissions).mockReturnValue({
      isCRUser: false,
      isCRAdmin: false,
      isAdmin: true,
      isSuperuser: false,
      isHR: false,
      isTeamLeader: false,
    } as any);
    renderWithRoute();
    expect(screen.getByText("Employee Dashboard")).toBeInTheDocument();
  });

  it("allows team leader through", () => {
    vi.mocked(usePermissions).mockReturnValue({
      isCRUser: false,
      isCRAdmin: false,
      isAdmin: false,
      isSuperuser: false,
      isHR: false,
      isTeamLeader: true,
    } as any);
    renderWithRoute();
    expect(screen.getByText("Employee Dashboard")).toBeInTheDocument();
  });

  it("allows multi-role CR+TL user through (isCRUser is false)", () => {
    vi.mocked(usePermissions).mockReturnValue({
      isCRUser: false,
      isCRAdmin: false,
      isAdmin: false,
      isSuperuser: false,
      isHR: false,
      isTeamLeader: true,
    } as any);
    renderWithRoute();
    expect(screen.getByText("Employee Dashboard")).toBeInTheDocument();
  });
});
