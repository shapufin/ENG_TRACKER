import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, it, expect } from "vitest";
import BackupSidebarItem from "./BackupSidebarItem";

const usePermissions = vi.fn();

vi.mock("@/context/PermissionContext", () => ({
  usePermissions: () => usePermissions(),
}));

describe("BackupSidebarItem", () => {
  it("hides for non-superusers, even admins", () => {
    usePermissions.mockReturnValue({ isSuperuser: false });
    render(<BackupSidebarItem />, { wrapper: MemoryRouter });
    expect(screen.queryByText("Backup & Restore")).not.toBeInTheDocument();
  });

  it("renders the link for superusers", () => {
    usePermissions.mockReturnValue({ isSuperuser: true });
    render(
      <MemoryRouter initialEntries={["/admin/backup-restore"]}>
        <BackupSidebarItem />
      </MemoryRouter>
    );
    expect(screen.getByRole("menuitem", { name: "Backup & Restore" })).toHaveAttribute(
      "href",
      "/admin/backup-restore"
    );
  });
});
