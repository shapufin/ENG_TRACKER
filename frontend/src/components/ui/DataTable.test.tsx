import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { DataTable } from "./DataTable";
import type { ColumnDef, RowSelectionState, VisibilityState } from "@tanstack/react-table";

interface Item {
  id: number;
  name: string;
  email: string;
}

const columns: ColumnDef<Item>[] = [
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "email",
    header: "Email",
  },
];

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

function DataTableWrapper() {
  const [data, setData] = useState<Item[]>([{ id: 1, name: "Alice", email: "alice@test.com" }]);
  return (
    <div>
      <button
        onClick={() => setData((prev) => [...prev, { id: 2, name: "Bob", email: "bob@test.com" }])}
      >
        Add row
      </button>
      <DataTable columns={columns} data={data} getRowId={(row) => row.id.toString()} />
    </div>
  );
}

function SelectionWrapper() {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  return (
    <DataTable
      columns={columns}
      data={[{ id: 1, name: "Alice", email: "alice@test.com" }]}
      getRowId={(row) => row.id.toString()}
      enableRowSelection
      rowSelection={rowSelection}
      onRowSelectionChange={setRowSelection}
    />
  );
}

function ColumnVisibilityWrapper() {
  const [visibility, setVisibility] = useState<VisibilityState>({ name: true, email: true });
  return (
    <div>
      <button onClick={() => setVisibility((prev) => ({ ...prev, email: !prev.email }))}>
        Toggle Email
      </button>
      <DataTable
        columns={columns}
        data={[{ id: 1, name: "Alice", email: "alice@test.com" }]}
        getRowId={(row) => row.id.toString()}
        enableColumnVisibility
        columnVisibility={visibility}
        onColumnVisibilityChange={setVisibility}
      />
    </div>
  );
}

describe("DataTable", () => {
  it("re-renders rows when the data prop changes", async () => {
    render(<DataTableWrapper />);

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /add row/i }));

    expect(await screen.findByText("Bob")).toBeInTheDocument();
  });

  it("checkbox visually updates when a row is selected", () => {
    render(<SelectionWrapper />);

    const checkbox = screen.getByRole("checkbox", { name: "Select row" });
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);

    // After click, the checkbox must reflect the selected state — this is the
    // regression for the stale-memo bug where checkboxes stayed empty.
    expect(checkbox).toBeChecked();
  });

  it("selected row gets bg-primary/10 highlight", () => {
    const { container } = render(<SelectionWrapper />);

    const checkbox = screen.getByRole("checkbox", { name: "Select row" });
    fireEvent.click(checkbox);

    const row = container.querySelector("tbody tr");
    expect(row).toHaveAttribute("data-state", "selected");
    expect(row?.className).toContain("bg-primary/10");
  });

  it("hides column body cells in real-time when visibility toggles", () => {
    // Regression for the stale-memo bug: renderedRows was memoized without
    // columnVisibility in deps, so toggling a column off kept the old cells
    // visible until a page refresh.
    render(<ColumnVisibilityWrapper />);

    // Both columns visible initially
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("alice@test.com")).toBeInTheDocument();

    // Toggle email column off
    fireEvent.click(screen.getByRole("button", { name: /toggle email/i }));

    // Email cell must disappear immediately (no refresh needed)
    expect(screen.queryByText("alice@test.com")).not.toBeInTheDocument();
    // Name cell must still be visible
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("shows column body cells in real-time when visibility toggles back on", () => {
    render(<ColumnVisibilityWrapper />);

    // Hide email
    fireEvent.click(screen.getByRole("button", { name: /toggle email/i }));
    expect(screen.queryByText("alice@test.com")).not.toBeInTheDocument();

    // Show email again
    fireEvent.click(screen.getByRole("button", { name: /toggle email/i }));
    expect(screen.getByText("alice@test.com")).toBeInTheDocument();
  });

  it("does not count persisted metadata as a visible column", () => {
    localStorage.setItem(
      "table-visibility-test",
      JSON.stringify({ _version: 1, name: true, email: true })
    );

    render(
      <DataTable
        columns={columns}
        data={[{ id: 1, name: "Alice", email: "alice@test.com" }]}
        enableColumnVisibility
        storageKey="table-visibility-test"
      />
    );

    expect(screen.getByText("Columns (2/2)")).toBeInTheDocument();
  });

  it("labels search and pagination controls accessibly", () => {
    render(
      <DataTable
        columns={columns}
        data={[
          { id: 1, name: "Alice", email: "alice@test.com" },
          { id: 2, name: "Bob", email: "bob@test.com" },
        ]}
        searchColumn="name"
        searchPlaceholder="Search people..."
        pageSize={1}
      />
    );

    expect(screen.getByRole("textbox", { name: "Search people..." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "First page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Last page" })).toBeInTheDocument();
  });

  it("activates clickable rows from the keyboard", () => {
    const onRowClick = vi.fn();
    const { container } = render(
      <DataTable
        columns={columns}
        data={[{ id: 1, name: "Alice", email: "alice@test.com" }]}
        onRowClick={onRowClick}
      />
    );

    const row = container.querySelector("tbody tr");
    expect(row).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(row as HTMLElement, { key: "Enter" });
    expect(onRowClick).toHaveBeenCalledWith({ id: 1, name: "Alice", email: "alice@test.com" });
  });

  it("uses an opaque blurred header surface so body rows do not bleed through", () => {
    // Design convergence: sticky header surfaces use bg-muted/90 + backdrop-blur-sm
    // (never the translucent /40 or /50 variants that let rows show through).
    const { container } = render(
      <DataTable columns={columns} data={[{ id: 1, name: "Alice", email: "alice@test.com" }]} />
    );

    const headerRow = container.querySelector("thead tr");
    expect(headerRow?.className).toContain("bg-muted/90");
    expect(headerRow?.className).toContain("backdrop-blur-sm");
    expect(headerRow?.className).not.toContain("bg-muted/40");
  });
});
