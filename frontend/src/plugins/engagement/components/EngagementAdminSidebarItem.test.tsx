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

  it("renders link to /admin/engagement for a team leader", () => {
    usePermissions.mockReturnValue({ isTeamLeader: true, isAdmin: false });
    render(
      <MemoryRouter initialEntries={["/admin/engagement"]}>
        <EngagementAdminSidebarItem />
      </MemoryRouter>
    );
    const link = screen.getByRole("menuitem", { name: "Engagement" });
    expect(link).toHaveAttribute("href", "/admin/engagement");
  });

  it("renders for an admin even without the team-leader role", () => {
    usePermissions.mockReturnValue({ isTeamLeader: false, isAdmin: true });
    render(<EngagementAdminSidebarItem />, { wrapper: MemoryRouter });
    expect(screen.getByText("Engagement")).toBeInTheDocument();
  });
});
