import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, it, expect } from "vitest";
import AuditLogSidebarItem from "./AuditLogSidebarItem";

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

describe("AuditLogSidebarItem", () => {
  it("hides when audit_log view permission is denied", () => {
    canView.mockReturnValue(false);
    usePermissions.mockReturnValue(fullAdmin);
    render(<AuditLogSidebarItem />, { wrapper: MemoryRouter });
    expect(screen.queryByText("Audit Logs")).not.toBeInTheDocument();
  });

  it("renders the dynamic plugin navigation link when allowed", () => {
    canView.mockReturnValue(true);
    usePermissions.mockReturnValue(fullAdmin);
    render(
      <MemoryRouter initialEntries={["/admin/audit-logs"]}>
        <AuditLogSidebarItem />
      </MemoryRouter>
    );
    expect(screen.getByRole("menuitem", { name: "Audit Logs" })).toHaveAttribute(
      "href",
      "/admin/audit-logs"
    );
  });

  it("hides from CR-only admins even when view permission is granted", () => {
    canView.mockReturnValue(true);
    usePermissions.mockReturnValue(crOnlyAdmin);
    render(<AuditLogSidebarItem />, { wrapper: MemoryRouter });
    expect(screen.queryByText("Audit Logs")).not.toBeInTheDocument();
  });

  it("active state uses text-foreground for link text, text-primary for icon", () => {
    canView.mockReturnValue(true);
    usePermissions.mockReturnValue(fullAdmin);
    render(
      <MemoryRouter initialEntries={["/admin/audit-logs"]}>
        <AuditLogSidebarItem />
      </MemoryRouter>
    );
    const link = screen.getByRole("menuitem", { name: "Audit Logs" });
    expect(link.className).toContain("text-foreground");
    expect(link.className).not.toMatch(/(^|\s)text-primary(\s|$)/);
    expect(link.querySelector("svg")?.getAttribute("class")).toContain("text-primary");
  });
});
