import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { UsersPageTable } from "./UsersPageTable";
import { MOBILE_CARD_QUERY } from "@/components/ui/DataTableCards";
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
  { id: "it_tl", header: "Manager (Assigned)", accessorFn: () => "-" },
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
    expect(screen.getByText("Manager (Assigned)")).toBeInTheDocument();
    for (const hidden of ["Email", "CR Teams", "Hire Date"]) {
      expect(screen.queryByRole("columnheader", { name: new RegExp(hidden) })).toBeNull();
    }
  });
});

describe("UsersPageTable phone cards", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows each user as a card with the name, role and team on phones", () => {
    localStorage.clear();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query === MOBILE_CARD_QUERY,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
    const cols = [
      { id: "username", header: "Username", accessorFn: () => "ada" },
      { id: "team", header: "Team", accessorFn: () => "Infra" },
      { id: "tl_role", header: "TL Role", accessorFn: () => "Manager" },
      { id: "actions", header: "Actions", cell: () => <button type="button">Edit</button> },
    ] as unknown as AppColumnDef<UserProfile>[];
    render(
      <UsersPageTable
        columns={cols}
        data={[{ id: 1 } as UserProfile]}
        rowSelection={{}}
        onRowSelectionChange={vi.fn()}
        server={{ search: "", onSearchChange: vi.fn(), page: 1, total: 1, onPageChange: vi.fn() }}
      />
    );

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const card = screen.getByRole("listitem");
    expect(within(card).getByText("ada")).toBeInTheDocument();
    expect(within(card).getByText("Manager")).toBeInTheDocument();
    expect(within(card).getByText("Infra")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });
});
