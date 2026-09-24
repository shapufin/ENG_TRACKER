import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, it, expect } from "vitest";
import OnboardingSidebarLink from "./OnboardingSidebarLink";

const usePermissions = vi.fn();
const useAuth = vi.fn();

vi.mock("@/context/PermissionContext", () => ({
  usePermissions: () => usePermissions(),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => useAuth(),
}));

describe("OnboardingSidebarLink", () => {
  it("hides for an employee with zero assigned clients", () => {
    usePermissions.mockReturnValue({ isEmployee: true, isTeamLeader: false, isAdmin: false });
    useAuth.mockReturnValue({ user: { client_ids: [] } });
    render(<OnboardingSidebarLink />, { wrapper: MemoryRouter });
    expect(screen.queryByText("Onboarding")).not.toBeInTheDocument();
  });

  it("renders for an employee with at least one assigned client", () => {
    usePermissions.mockReturnValue({ isEmployee: true, isTeamLeader: false, isAdmin: false });
    useAuth.mockReturnValue({ user: { client_ids: [1] } });
    render(<OnboardingSidebarLink />, { wrapper: MemoryRouter });
    expect(screen.getByText("Onboarding")).toBeInTheDocument();
  });

  it("renders for a team leader with at least one assigned client", () => {
    usePermissions.mockReturnValue({ isEmployee: false, isTeamLeader: true, isAdmin: false });
    useAuth.mockReturnValue({ user: { client_ids: [2] } });
    render(<OnboardingSidebarLink />, { wrapper: MemoryRouter });
    expect(screen.getByText("Onboarding")).toBeInTheDocument();
  });

  it("hides for HR with assigned clients (not an employee/TL/admin role)", () => {
    usePermissions.mockReturnValue({ isEmployee: false, isTeamLeader: false, isAdmin: false });
    useAuth.mockReturnValue({ user: { client_ids: [1] } });
    render(<OnboardingSidebarLink />, { wrapper: MemoryRouter });
    expect(screen.queryByText("Onboarding")).not.toBeInTheDocument();
  });
});
