import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { SuperuserRoute } from "./SuperuserRoute";

vi.mock("@/context/PermissionContext", () => ({
  usePermissions: vi.fn(),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

import { usePermissions } from "@/context/PermissionContext";
import { useAuth } from "@/context/AuthContext";

const renderWithRoute = () =>
  render(
    <MemoryRouter initialEntries={["/admin"]}>
      <Routes>
        <Route element={<SuperuserRoute />}>
          <Route path="/admin" element={<div>Protected</div>} />
        </Route>
        <Route path="/dashboard" element={<div>Dashboard</div>} />
        <Route path="/control-room/dashboard" element={<div>CR Dashboard</div>} />
      </Routes>
    </MemoryRouter>
  );

describe("SuperuserRoute", () => {
  it("renders loading state", () => {
    vi.mocked(usePermissions).mockReturnValue({
      isSuperuser: false,
      isAdmin: false,
      isHR: false,
    } as any);
    vi.mocked(useAuth).mockReturnValue({ isLoading: true } as any);
    renderWithRoute();
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("allows superuser", () => {
    vi.mocked(usePermissions).mockReturnValue({
      isSuperuser: true,
      isAdmin: false,
      isHR: false,
    } as any);
    vi.mocked(useAuth).mockReturnValue({ isLoading: false } as any);
    renderWithRoute();
    expect(screen.getByText("Protected")).toBeInTheDocument();
  });

  it("allows admin", () => {
    vi.mocked(usePermissions).mockReturnValue({
      isSuperuser: false,
      isAdmin: true,
      isHR: false,
    } as any);
    vi.mocked(useAuth).mockReturnValue({ isLoading: false } as any);
    renderWithRoute();
    expect(screen.getByText("Protected")).toBeInTheDocument();
  });

  it("allows hr", () => {
    vi.mocked(usePermissions).mockReturnValue({
      isSuperuser: false,
      isAdmin: false,
      isHR: true,
    } as any);
    vi.mocked(useAuth).mockReturnValue({ isLoading: false } as any);
    renderWithRoute();
    expect(screen.getByText("Protected")).toBeInTheDocument();
  });

  it("redirects CR-only admin to the unified Control Room app shell", () => {
    vi.mocked(usePermissions).mockReturnValue({
      isSuperuser: false,
      isAdmin: false,
      isHR: false,
      isCRAdmin: true,
      isTeamLeader: false,
    } as any);
    vi.mocked(useAuth).mockReturnValue({ isLoading: false } as any);
    renderWithRoute();
    expect(screen.getByText("CR Dashboard")).toBeInTheDocument();
  });

  it("redirects unauthorized", () => {
    vi.mocked(usePermissions).mockReturnValue({
      isSuperuser: false,
      isAdmin: false,
      isHR: false,
    } as any);
    vi.mocked(useAuth).mockReturnValue({ isLoading: false } as any);
    renderWithRoute();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });
});
