import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { UsersPageHeader } from "./UsersPageHeader";

vi.mock("@/context/PermissionContext", () => ({
  usePermissions: vi.fn(),
}));

vi.mock("@/components/admin/PluginImportButton", () => ({
  PluginImportButton: () => <div>Import Users</div>,
}));

import { usePermissions } from "@/context/PermissionContext";

describe("UsersPageHeader", () => {
  it("shows Create User for admin", () => {
    vi.mocked(usePermissions).mockReturnValue({
      isHR: false,
      isAdmin: true,
      isSuperuser: false,
    } as any);
    render(<UsersPageHeader onCreate={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Create User/ })).toBeInTheDocument();
  });

  it("shows Create User for superuser", () => {
    vi.mocked(usePermissions).mockReturnValue({
      isHR: false,
      isAdmin: false,
      isSuperuser: true,
    } as any);
    render(<UsersPageHeader onCreate={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Create User/ })).toBeInTheDocument();
  });

  it("hides Create User for pure HR — HR has no create-user permission", () => {
    vi.mocked(usePermissions).mockReturnValue({
      isHR: true,
      isAdmin: false,
      isSuperuser: false,
    } as any);
    render(<UsersPageHeader onCreate={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Create User/ })).not.toBeInTheDocument();
  });

  it("shows Create User for an HR user who is also admin", () => {
    vi.mocked(usePermissions).mockReturnValue({
      isHR: true,
      isAdmin: true,
      isSuperuser: false,
    } as any);
    render(<UsersPageHeader onCreate={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Create User/ })).toBeInTheDocument();
  });
});
