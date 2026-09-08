import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ControlRoomSidebarItem from "./ControlRoomSidebarItem";
import { useControlRoomMe } from "../hooks/useControlRoomAccess";
import { usePermissions } from "@/context/PermissionContext";

vi.mock("../hooks/useControlRoomAccess", () => ({
  useControlRoomMe: vi.fn(),
}));

vi.mock("@/context/PermissionContext", () => ({
  usePermissions: vi.fn(),
}));

describe("ControlRoomSidebarItem", () => {
  it("shows dashboard and access links for a CR-only admin in the app shell", () => {
    vi.mocked(useControlRoomMe).mockReturnValue({
      data: { has_access: true },
      isLoading: false,
    } as any);
    vi.mocked(usePermissions).mockReturnValue({ isCRAdmin: true } as any);

    render(
      <MemoryRouter initialEntries={["/control-room/dashboard"]}>
        <ControlRoomSidebarItem />
      </MemoryRouter>
    );

    expect(screen.getByRole("menuitem", { name: "Control Room" })).toHaveAttribute(
      "href",
      "/control-room/dashboard"
    );
    expect(screen.getByRole("menuitem", { name: "Control Room Access" })).toHaveAttribute(
      "href",
      "/control-room/access"
    );
  });

  it("shows only the dashboard link for a normal CR user", () => {
    vi.mocked(useControlRoomMe).mockReturnValue({
      data: { has_access: true },
      isLoading: false,
    } as any);
    vi.mocked(usePermissions).mockReturnValue({ isCRAdmin: false } as any);

    render(
      <MemoryRouter>
        <ControlRoomSidebarItem />
      </MemoryRouter>
    );

    expect(screen.getByRole("menuitem", { name: "Control Room" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Control Room Access" })).not.toBeInTheDocument();
  });
});
