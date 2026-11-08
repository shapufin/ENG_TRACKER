import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DashboardQuickActions } from "./DashboardQuickActions";

const permissions = vi.hoisted(() => ({
  value: {
    isAdmin: false,
    isHR: false,
    isHROnly: false,
    isHBPROnly: false,
    isTeamLeader: false,
    isEmployee: true,
    isSuperuser: false,
    isCRAdmin: false,
    isCRUser: false,
  },
}));

vi.mock("@/context/PermissionContext", () => ({ usePermissions: () => permissions.value }));
vi.mock("@/context/PluginContext", () => ({ usePlugins: () => ({ activePlugins: [] }) }));

const renderActions = () =>
  render(
    <MemoryRouter>
      <DashboardQuickActions />
    </MemoryRouter>
  );

describe("DashboardQuickActions", () => {
  beforeEach(() => {
    permissions.value = {
      isAdmin: false,
      isHR: false,
      isHROnly: false,
      isHBPROnly: false,
      isTeamLeader: false,
      isEmployee: true,
      isSuperuser: false,
      isCRAdmin: false,
      isCRUser: false,
    };
  });

  it("links an employee to Overtime, Standby and Leave, and shows only on phones", () => {
    const { container } = renderActions();

    expect(screen.getByRole("link", { name: /overtime/i })).toHaveAttribute("href", "/overtime");
    expect(screen.getByRole("link", { name: /standby/i })).toHaveAttribute("href", "/standby");
    expect(screen.getByRole("link", { name: /leave/i })).toHaveAttribute(
      "href",
      "/leave-management"
    );
    expect(container.firstElementChild).toHaveClass("md:hidden");
  });

  it("offers nothing a user's navigation would hide", () => {
    permissions.value = { ...permissions.value, isEmployee: false, isHROnly: true, isHR: true };
    const { container } = renderActions();

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});
