import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ControlRoomAdminSidebarItem from "./ControlRoomAdminSidebarItem";
import { usePermissions } from "@/context/PermissionContext";

vi.mock("@/context/PermissionContext", () => ({
  usePermissions: vi.fn(),
}));

describe("ControlRoomAdminSidebarItem", () => {
  it("renders only the access management link for a CR admin", () => {
    vi.mocked(usePermissions).mockReturnValue({ isAdmin: false, isCRAdmin: true } as any);

    render(
      <MemoryRouter initialEntries={["/admin/users"]}>
        <ControlRoomAdminSidebarItem />
      </MemoryRouter>
    );

    expect(screen.getByRole("menuitem", { name: "Control Room Access" })).toHaveAttribute(
      "href",
      "/admin/control-room/access"
    );
    expect(screen.queryByText("Control Room Dashboard")).not.toBeInTheDocument();
  });

  it("renders only the access management link for a full admin", () => {
    vi.mocked(usePermissions).mockReturnValue({ isAdmin: true, isCRAdmin: false } as any);

    render(
      <MemoryRouter>
        <ControlRoomAdminSidebarItem />
      </MemoryRouter>
    );

    expect(screen.getByText("Control Room Access")).toBeInTheDocument();
    expect(screen.queryByText("Control Room Dashboard")).not.toBeInTheDocument();
  });

  it("does not render for a non-admin user", () => {
    vi.mocked(usePermissions).mockReturnValue({ isAdmin: false, isCRAdmin: false } as any);

    render(
      <MemoryRouter>
        <ControlRoomAdminSidebarItem />
      </MemoryRouter>
    );

    expect(screen.queryByText("Control Room Access")).not.toBeInTheDocument();
  });

  it("highlights the access link when on /admin/control-room/access", () => {
    vi.mocked(usePermissions).mockReturnValue({ isAdmin: true, isCRAdmin: false } as any);

    render(
      <MemoryRouter initialEntries={["/admin/control-room/access"]}>
        <ControlRoomAdminSidebarItem />
      </MemoryRouter>
    );

    const accessLink = screen.getByRole("menuitem", { name: "Control Room Access" });
    expect(accessLink.className).toContain("bg-primary/10");
  });

  it("active state uses text-foreground for link text, text-primary for icon", () => {
    vi.mocked(usePermissions).mockReturnValue({ isAdmin: true, isCRAdmin: false } as any);

    render(
      <MemoryRouter initialEntries={["/admin/control-room/access"]}>
        <ControlRoomAdminSidebarItem />
      </MemoryRouter>
    );

    const accessLink = screen.getByRole("menuitem", { name: "Control Room Access" });
    expect(accessLink.className).toContain("text-foreground");
    expect(accessLink.className).not.toMatch(/(^|\s)text-primary(\s|$)/);
    expect(accessLink.querySelector("svg")?.getAttribute("class")).toContain("text-primary");
  });
});
