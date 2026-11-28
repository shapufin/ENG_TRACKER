import { afterEach, describe, it, expect, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
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
  { id: "username", header: "Username", accessorFn: () => "ada", size: 160, meta: { priority: 1 } },
  {
    id: "email",
    header: "Email",
    accessorFn: () => "ada@example.com",
    size: 200,
    meta: { priority: 3 },
  },
  { id: "cr_teams", header: "CR Teams", accessorFn: () => "-", size: 110, meta: { priority: 2 } },
  {
    id: "hire_date",
    header: "Hire Date",
    accessorFn: () => "01/01/2024",
    size: 110,
    meta: { priority: 3 },
  },
  {
    id: "it_tl",
    header: "Manager (Assigned)",
    accessorFn: () => "-",
    size: 145,
    meta: { priority: 3 },
  },
] as unknown as AppColumnDef<UserProfile>[];

describe("UsersPageTable default columns", () => {
  it("shows every column when the width is unknown and offers the Columns menu", () => {
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
    for (const name of ["Username", "Email", "CR Teams", "Hire Date", "Manager (Assigned)"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: /Columns \(5\/5\)/ })).toBeInTheDocument();
  });

  it("auto-hides the lowest-priority columns on a narrow viewport instead of scrolling", () => {
    localStorage.clear();
    let notify: ((width: number) => void) | undefined;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: (entries: { contentRect: { width: number } }[]) => void) {
          notify = (width) => cb([{ contentRect: { width } }]);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    render(
      <UsersPageTable
        columns={columns}
        data={[{ id: 1 } as UserProfile]}
        rowSelection={{}}
        onRowSelectionChange={vi.fn()}
        server={{ search: "", onSearchChange: vi.fn(), page: 1, total: 1, onPageChange: vi.fn() }}
      />
    );
    act(() => notify?.(500));
    expect(screen.getByRole("columnheader", { name: /Username/ })).toBeInTheDocument();
    for (const hidden of ["Email", "Hire Date", "Manager"]) {
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
