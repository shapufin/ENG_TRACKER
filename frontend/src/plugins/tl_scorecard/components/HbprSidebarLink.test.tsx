import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HbprSidebarLink from "./HbprSidebarLink";

const usePermissions = vi.fn();

vi.mock("@/context/PermissionContext", () => ({
  usePermissions: () => usePermissions(),
}));

vi.mock("@/components/layout/SidebarNavLink", () => ({
  SidebarNavLink: ({ label, to }: { label: string; to: string }) => <a href={to}>{label}</a>,
}));

describe("HbprSidebarLink", () => {
  it("is hidden for anyone without the HBPR role", () => {
    usePermissions.mockReturnValue({ isHBPR: false });

    render(
      <MemoryRouter>
        <HbprSidebarLink />
      </MemoryRouter>
    );

    expect(screen.queryByText("HBPR Workspace")).not.toBeInTheDocument();
  });

  it("links an HBPR to the workspace", () => {
    usePermissions.mockReturnValue({ isHBPR: true });

    render(
      <MemoryRouter>
        <HbprSidebarLink />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "HBPR Workspace" })).toHaveAttribute("href", "/hbpr");
  });
});
