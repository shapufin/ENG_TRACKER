import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MyRecordsSidebarLink from "./MyRecordsSidebarLink";

const perms = { value: {} as Record<string, boolean> };

vi.mock("@/context/PermissionContext", () => ({
  usePermissions: () => perms.value,
}));

vi.mock("@/components/layout/SidebarNavLink", () => ({
  SidebarNavLink: ({ label, to, isActive }: { label: string; to: string; isActive: boolean }) => (
    <a href={to} data-active={isActive}>
      {label}
    </a>
  ),
}));

const renderLink = (path = "/my-records") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <MyRecordsSidebarLink />
    </MemoryRouter>
  );

describe("MyRecordsSidebarLink", () => {
  it("renders for an ordinary user and marks itself active on /my-records", () => {
    perms.value = { isHBPROnly: false };
    renderLink();
    const link = screen.getByText("My records");
    expect(link).toHaveAttribute("href", "/my-records");
    expect(link).toHaveAttribute("data-active", "true");
  });

  it("renders for a multi-role HBPR+HR user", () => {
    perms.value = { isHBPROnly: false, isHBPR: true, isHR: true };
    renderLink();
    expect(screen.getByText("My records")).toBeInTheDocument();
  });

  it("is hidden for an HBPR-only user", () => {
    perms.value = { isHBPROnly: true };
    renderLink();
    expect(screen.queryByText("My records")).not.toBeInTheDocument();
  });

  it("is hidden for an Albanian TL, who is never the subject of these records", () => {
    perms.value = { isHBPROnly: false, isAlbanianTL: true };
    renderLink();
    expect(screen.queryByText("My records")).not.toBeInTheDocument();
  });
});
