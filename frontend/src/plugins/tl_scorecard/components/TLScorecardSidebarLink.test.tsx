import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TLScorecardSidebarLink from "./TLScorecardSidebarLink";

const usePermissions = vi.fn();

vi.mock("@/context/PermissionContext", () => ({
  usePermissions: () => usePermissions(),
}));

vi.mock("@/components/layout/SidebarNavLink", () => ({
  SidebarNavLink: ({ label }: { label: string }) => <span>{label}</span>,
}));

describe("TLScorecardSidebarLink", () => {
  it("is hidden for a non-TL employee", () => {
    usePermissions.mockReturnValue({ isTeamLeader: false, isAdmin: false });

    render(
      <MemoryRouter>
        <TLScorecardSidebarLink />
      </MemoryRouter>
    );

    expect(screen.queryByText("TL Scorecard")).not.toBeInTheDocument();
  });

  it("is visible for a team leader", () => {
    usePermissions.mockReturnValue({ isTeamLeader: true, isAdmin: false });

    render(
      <MemoryRouter>
        <TLScorecardSidebarLink />
      </MemoryRouter>
    );

    expect(screen.getByText("TL Scorecard")).toBeInTheDocument();
  });

  it("is visible for staff admins (backend staff bypass)", () => {
    usePermissions.mockReturnValue({ isTeamLeader: false, isAdmin: true });

    render(
      <MemoryRouter>
        <TLScorecardSidebarLink />
      </MemoryRouter>
    );

    expect(screen.getByText("TL Scorecard")).toBeInTheDocument();
  });
});
