import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, it, expect } from "vitest";
import AnalyticsAdminSidebarItem from "./AnalyticsAdminSidebarItem";

const canView = vi.fn();
const usePermissions = vi.fn();

vi.mock("@/hooks/usePluginPermissions", () => ({
  usePluginPermissions: () => ({ canView }),
}));
vi.mock("@/context/PermissionContext", () => ({
  usePermissions: () => usePermissions(),
}));

const fullAdmin = {
  isAdmin: true,
  isSuperuser: false,
  isHR: false,
  isTeamLeader: false,
  isCRAdmin: false,
};
const crOnlyAdmin = {
  isAdmin: false,
  isSuperuser: false,
  isHR: false,
  isTeamLeader: false,
  isCRAdmin: true,
};

describe("AnalyticsAdminSidebarItem (admin sidebar)", () => {
  it("hides when analytics view permission is denied", () => {
    canView.mockReturnValue(false);
    usePermissions.mockReturnValue(fullAdmin);
    render(<AnalyticsAdminSidebarItem />, { wrapper: MemoryRouter });
    expect(screen.queryByText("Analytics")).not.toBeInTheDocument();
  });

  it("renders link to /admin/analytics when allowed", () => {
    canView.mockReturnValue(true);
    usePermissions.mockReturnValue(fullAdmin);
    render(
      <MemoryRouter initialEntries={["/admin/analytics"]}>
        <AnalyticsAdminSidebarItem />
      </MemoryRouter>
    );
    const link = screen.getByRole("menuitem", { name: "Analytics" });
    expect(link).toHaveAttribute("href", "/admin/analytics");
  });

  it("hides from CR-only admins even when view permission is granted", () => {
    canView.mockReturnValue(true);
    usePermissions.mockReturnValue(crOnlyAdmin);
    render(<AnalyticsAdminSidebarItem />, { wrapper: MemoryRouter });
    expect(screen.queryByText("Analytics")).not.toBeInTheDocument();
  });

  it("active state uses text-foreground for link text, text-primary for icon", () => {
    canView.mockReturnValue(true);
    usePermissions.mockReturnValue(fullAdmin);
    render(
      <MemoryRouter initialEntries={["/admin/analytics"]}>
        <AnalyticsAdminSidebarItem />
      </MemoryRouter>
    );
    const link = screen.getByRole("menuitem", { name: "Analytics" });
    expect(link.className).toContain("text-foreground");
    expect(link.className).not.toMatch(/(^|\s)text-primary(\s|$)/);
    expect(link.querySelector("svg")?.getAttribute("class")).toContain("text-primary");
  });
});
