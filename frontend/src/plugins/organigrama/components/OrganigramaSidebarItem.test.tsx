import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OrganigramaSidebarItem from "./OrganigramaSidebarItem";

const usePermissions = vi.fn();

vi.mock("@/context/PermissionContext", () => ({
  usePermissions: () => usePermissions(),
}));

vi.mock("@/components/layout/SidebarNavLink", () => ({
  SidebarNavLink: ({ label }: { label: string }) => <span>{label}</span>,
}));

describe("OrganigramaSidebarItem", () => {
  it.each([
    ["CR user", { isCRUser: true, isCRAdmin: false }],
    ["CR-only admin", { isCRUser: false, isCRAdmin: true }],
  ])("is hidden for %s", (_label, permissions) => {
    usePermissions.mockReturnValue(permissions);

    render(
      <MemoryRouter>
        <OrganigramaSidebarItem />
      </MemoryRouter>
    );

    expect(screen.queryByText("Organigrama")).not.toBeInTheDocument();
  });

  it("remains visible for a regular user", () => {
    usePermissions.mockReturnValue({ isCRUser: false, isCRAdmin: false });

    render(
      <MemoryRouter>
        <OrganigramaSidebarItem />
      </MemoryRouter>
    );

    expect(screen.getByText("Organigrama")).toBeInTheDocument();
  });
});
