import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DataTable } from "./DataTable";
import { MOBILE_CARD_QUERY } from "./DataTableCards";
import type { AppColumnDef } from "./tableTypes";

type Row = { id: number; client: string; hours: number; status: string; note: string };

const rows: Row[] = [
  { id: 1, client: "Acme", hours: 2, status: "pending", note: "Night deploy" },
  { id: 2, client: "Globex", hours: 1, status: "approved", note: "Hotfix" },
];

const onEdit = vi.fn();

const columns: AppColumnDef<Row>[] = [
  { accessorKey: "client", header: "Client" },
  { accessorKey: "hours", header: "Hours", cell: ({ row }) => `${row.original.hours}h` },
  { accessorKey: "status", header: "Status" },
  { accessorKey: "note", header: "Note" },
  {
    id: "actions",
    header: "Actions",
    meta: { actionsDisplay: "column" },
    cell: ({ row }) => (
      <button type="button" onClick={() => onEdit(row.original.id)}>
        {`Edit ${row.original.id}`}
      </button>
    ),
  },
];

const spec = { title: "client", hero: "hours", status: "status", meta: ["note"] };

const mockViewport = (compact: boolean) => {
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
      matches: compact && query === MOBILE_CARD_QUERY,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
};

describe("DataTable mobile cards", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the table on wide screens even when a card layout is provided", () => {
    mockViewport(false);
    render(<DataTable columns={columns} data={rows} mobileCard={spec} />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("renders one card per row with title, hero, status, meta and actions on phones", () => {
    mockViewport(true);
    render(<DataTable columns={columns} data={rows} mobileCard={spec} />);

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(2);

    const first = within(cards[0]);
    expect(first.getByText("Acme")).toBeInTheDocument();
    expect(first.getByText("2h")).toBeInTheDocument();
    expect(first.getByText("pending")).toBeInTheDocument();
    expect(first.getByText("Note")).toBeInTheDocument();
    expect(first.getByText("Night deploy")).toBeInTheDocument();

    fireEvent.click(first.getByRole("button", { name: "Edit 1" }));
    expect(onEdit).toHaveBeenCalledWith(1);
  });

  it("selects cards and offers select-all, so bulk actions still work", () => {
    mockViewport(true);
    const onRowSelectionChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={rows}
        mobileCard={spec}
        enableRowSelection
        rowSelection={{}}
        onRowSelectionChange={onRowSelectionChange}
        getRowId={(r) => String(r.id)}
      />
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Acme" }));
    expect(onRowSelectionChange).toHaveBeenCalled();
    expect(
      screen.getByRole("checkbox", { name: "Select all rows on this page" })
    ).toBeInTheDocument();
  });

  it("shows the empty message and the result count instead of cards when there is no data", () => {
    mockViewport(true);
    render(<DataTable columns={columns} data={[]} mobileCard={spec} emptyMessage="Nothing here" />);

    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByText("0 results")).toBeInTheDocument();
  });

  it("names a card by a nested accessor column, so its checkbox label is the person", () => {
    mockViewport(true);
    type Nested = { id: number; user: { username: string } };
    const nested: AppColumnDef<Nested>[] = [{ accessorKey: "user.username", header: "User" }];
    render(
      <DataTable
        columns={nested}
        data={[{ id: 7, user: { username: "alice" } }]}
        mobileCard={{ title: "user_username" }}
        enableRowSelection
        rowSelection={{}}
        onRowSelectionChange={vi.fn()}
        getRowId={(r) => String(r.id)}
      />
    );

    expect(screen.getByRole("checkbox", { name: "Select alice" })).toBeInTheDocument();
  });
  it("opens a card from the keyboard and ignores keys pressed on its own buttons", () => {
    mockViewport(true);
    const onRowClick = vi.fn();
    render(<DataTable columns={columns} data={rows} mobileCard={spec} onRowClick={onRowClick} />);

    const cards = screen.getAllByRole("button", { name: /Acme|Globex/ });
    fireEvent.keyDown(cards[0], { key: "Enter" });
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);

    fireEvent.keyDown(screen.getByRole("button", { name: "Edit 2" }), { key: "Enter" });
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it("does not open the card when an action is tapped", () => {
    mockViewport(true);
    const onRowClick = vi.fn();
    render(<DataTable columns={columns} data={rows} mobileCard={spec} onRowClick={onRowClick} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit 1" }));
    expect(onEdit).toHaveBeenCalledWith(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("labels a card checkbox generically when its title column is hidden", () => {
    mockViewport(true);
    render(
      <DataTable
        columns={columns}
        data={rows}
        mobileCard={{ title: "missing" }}
        enableRowSelection
        rowSelection={{}}
        onRowSelectionChange={vi.fn()}
        getRowId={(r) => String(r.id)}
      />
    );
    expect(screen.getAllByRole("checkbox", { name: "Select row" })).toHaveLength(2);
  });
});
