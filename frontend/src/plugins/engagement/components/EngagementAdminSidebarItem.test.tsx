import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, it, expect } from "vitest";
import EngagementAdminSidebarItem from "./EngagementAdminSidebarItem";

const usePermissions = vi.fn();

vi.mock("@/context/PermissionContext", () => ({
  usePermissions: () => usePermissions(),
}));

describe("EngagementAdminSidebarItem (admin sidebar)", () => {
  it("hides for a non-TL, non-admin user", () => {
    usePermissions.mockReturnValue({ isTeamLeader: false, isAdmin: false });
    render(<EngagementAdminSidebarItem />, { wrapper: MemoryRouter });
    expect(screen.queryByText("Engagement")).not.toBeInTheDocument();
  });

  it("hides for a plain team leader (would be a dead link — /admin/* is staff-only)", () => {
    usePermissions.mockReturnValue({ isTeamLeader: true, isAdmin: false });
    render(<EngagementAdminSidebarItem />, { wrapper: MemoryRouter });
    expect(screen.queryByText("Engagement")).not.toBeInTheDocument();
  });

  it("renders link to /admin/engagement for an admin", () => {
    usePermissions.mockReturnValue({ isTeamLeader: false, isAdmin: true });
    render(
      <MemoryRouter initialEntries={["/admin/engagement"]}>
        <EngagementAdminSidebarItem />
      </MemoryRouter>
    );
    const link = screen.getByRole("menuitem", { name: "Engagement" });
    expect(link).toHaveAttribute("href", "/admin/engagement");
  });
});
