import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { UsersPageTable } from "./UsersPageTable";
import type { AppColumnDef } from "@/components/ui/tableTypes";
import type { UserProfile } from "@/types";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const columns = [
  { id: "username", header: "Username", accessorFn: () => "ada" },
  { id: "email", header: "Email", accessorFn: () => "ada@example.com" },
  { id: "cr_teams", header: "CR Teams", accessorFn: () => "-" },
  { id: "hire_date", header: "Hire Date", accessorFn: () => "01/01/2024" },
  { id: "it_tl", header: "IT TL (Assigned)", accessorFn: () => "-" },
] as unknown as AppColumnDef<UserProfile>[];

describe("UsersPageTable default columns", () => {
  it("hides the optional wide columns so the Actions column stays on screen at 1440px", () => {
    localStorage.clear();
    render(
      <UsersPageTable
        columns={columns}
        data={[{ id: 1 } as UserProfile]}
        rowSelection={{}}
        onRowSelectionChange={vi.fn()}
        server={{ search: "", onSearchChange: vi.fn(), page: 1, total: 1, onPageChange: vi.fn() }}
      />
    );
    expect(screen.getByText("Username")).toBeInTheDocument();
    expect(screen.getByText("IT TL (Assigned)")).toBeInTheDocument();
    for (const hidden of ["Email", "CR Teams", "Hire Date"]) {
      expect(screen.queryByRole("columnheader", { name: new RegExp(hidden) })).toBeNull();
    }
  });
});
