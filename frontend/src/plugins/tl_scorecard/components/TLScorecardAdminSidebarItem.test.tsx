import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, it, expect } from "vitest";
import TLScorecardAdminSidebarItem from "./TLScorecardAdminSidebarItem";

const usePermissions = vi.fn();

vi.mock("@/context/PermissionContext", () => ({
  usePermissions: () => usePermissions(),
}));

describe("TLScorecardAdminSidebarItem (admin sidebar)", () => {
  it("hides for a non-admin team leader", () => {
    usePermissions.mockReturnValue({ isTeamLeader: true, isAdmin: false });
    render(<TLScorecardAdminSidebarItem />, { wrapper: MemoryRouter });
    expect(screen.queryByText("TL Scorecard")).not.toBeInTheDocument();
  });

  it("renders link to /admin/tl-scorecard for an admin", () => {
    usePermissions.mockReturnValue({ isTeamLeader: false, isAdmin: true });
    render(
      <MemoryRouter initialEntries={["/admin/tl-scorecard"]}>
        <TLScorecardAdminSidebarItem />
      </MemoryRouter>
    );
    const link = screen.getByRole("menuitem", { name: "TL Scorecard" });
    expect(link).toHaveAttribute("href", "/admin/tl-scorecard");
  });

  it("hides for a non-TL, non-admin user", () => {
    usePermissions.mockReturnValue({ isTeamLeader: false, isAdmin: false });
    render(<TLScorecardAdminSidebarItem />, { wrapper: MemoryRouter });
    expect(screen.queryByText("TL Scorecard")).not.toBeInTheDocument();
  });
});
