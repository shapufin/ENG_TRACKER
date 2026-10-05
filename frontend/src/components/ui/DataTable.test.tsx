import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { DataTable } from "./DataTable";
import type { RowSelectionState, ColumnVisibilityState } from "@tanstack/react-table";
import type { AppColumnDef } from "@/components/ui/tableTypes";

interface Item {
  id: number;
  name: string;
  email: string;
}

const columns: AppColumnDef<Item>[] = [
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
  const [visibility, setVisibility] = useState<ColumnVisibilityState>({ name: true, email: true });
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

  it("renders a transparent header because the header never overlaps rows", () => {
    // Header treatment is an explicit override of the Time Tracker UI Project
    // mockups — see DESIGN.md "Table header contract" and
    // components/ui/tableStyles.ts. The viewport is overflow-x-auto only (no
    // max-height, no `sticky`), so no row can pass beneath the header. Headers
    // that DO stick keep their own opaque fill (see the allowlist in table-header-audit.mjs).
    const { container } = render(
      <DataTable columns={columns} data={[{ id: 1, name: "Alice", email: "alice@test.com" }]} />
    );

    const headerRow = container.querySelector("thead tr");
    expect(headerRow?.className).not.toContain("bg-muted/90");
    expect(headerRow?.className).not.toContain("backdrop-blur-sm");
  });

  it("sources its header from the shared table contract", () => {
    const { container } = render(
      <DataTable columns={columns} data={[{ id: 1, name: "Alice", email: "alice@test.com" }]} />
    );

    const th = container.querySelector("thead th");
    expect(th?.className).toContain("text-foreground");
    expect(th?.className).toContain("font-medium");
    expect(th?.className).not.toContain("uppercase");
    expect(th?.className).not.toContain("tracking-wider");
  });
  it("shows every column and reports all as visible by default when uncontrolled", () => {
    const { container } = render(
      <DataTable
        columns={columns}
        data={[{ id: 1, name: "Alice", email: "alice@test.com" }]}
        getRowId={(row) => row.id.toString()}
        enableColumnVisibility
      />
    );
    expect(screen.getByText("alice@test.com")).toBeInTheDocument();
    expect(container.querySelectorAll("thead th")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Columns \(2\/2\)/ })).toBeInTheDocument();
  });

  it("hides a column via the column menu when uncontrolled and no storageKey", () => {
    render(
      <DataTable
        columns={columns}
        data={[{ id: 1, name: "Alice", email: "alice@test.com" }]}
        getRowId={(row) => row.id.toString()}
        enableColumnVisibility
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Columns \(2\/2\)/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Email" }));
    expect(screen.queryByText("alice@test.com")).not.toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  describe("table features (react-table 9 parity)", () => {
    const people: Item[] = [
      { id: 1, name: "Carol", email: "carol@test.com" },
      { id: 2, name: "Alice", email: "alice@test.com" },
      { id: 3, name: "Bob", email: "bob@test.com" },
    ];
    const bodyNames = (container: HTMLElement) =>
      Array.from(container.querySelectorAll("tbody tr td:first-child")).map((td) => td.textContent);

    it("sorts ascending then descending when a sortable header is clicked", () => {
      const { container } = render(<DataTable columns={columns} data={people} />);
      expect(bodyNames(container)).toEqual(["Carol", "Alice", "Bob"]);

      fireEvent.click(screen.getByRole("button", { name: "Sort by name" }));
      expect(bodyNames(container)).toEqual(["Alice", "Bob", "Carol"]);

      fireEvent.click(screen.getByRole("button", { name: "Sort by name" }));
      expect(bodyNames(container)).toEqual(["Carol", "Bob", "Alice"]);
    });

    it("matches any of the listed search paths when searchColumn is an array", () => {
      const { container } = render(
        <DataTable
          columns={columns}
          data={[
            { id: 1, name: "Alice", email: "alice@test.com" },
            { id: 2, name: "Bob", email: "bob@test.com" },
          ]}
          searchColumn={["name", "email"]}
          searchPlaceholder="Search people..."
        />
      );

      fireEvent.change(screen.getByLabelText("Search people..."), { target: { value: "bob@" } });
      expect(bodyNames(container)).toEqual(["Bob"]);
    });

    it("searches ONLY the listed paths when searchColumn is an array", () => {
      const richColumns: AppColumnDef<Item & { role: string }>[] = [
        { accessorKey: "name", header: "Name" },
        { accessorKey: "email", header: "Email" },
        { accessorKey: "role", header: "Role" },
      ];
      const { container } = render(
        <DataTable
          columns={richColumns}
          data={[{ id: 1, name: "Alice", email: "alice@test.com", role: "admin" }]}
          searchColumn={["name", "email"]}
          searchPlaceholder="Search people..."
        />
      );

      // "admin" exists only in the unlisted `role` column — an all-cells
      // fallback would match it, the listed-path filter must not.
      fireEvent.change(screen.getByLabelText("Search people..."), { target: { value: "admin" } });
      expect(bodyNames(container)).not.toContain("Alice");
      expect(screen.getByText("No results found.")).toBeInTheDocument();
    });

    it("filters rows with the global search and reports the result count", () => {
      const { container } = render(
        <DataTable
          columns={columns}
          data={people}
          searchColumn="name"
          searchPlaceholder="Search..."
        />
      );
      fireEvent.change(screen.getByLabelText("Search..."), { target: { value: "bo" } });
      expect(bodyNames(container)).toEqual(["Bob"]);
      expect(screen.getByText("1 result")).toBeInTheDocument();
    });

    it("paginates and navigates between pages", () => {
      const many: Item[] = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        name: `Person ${i + 1}`,
        email: `p${i + 1}@test.com`,
      }));
      const { container } = render(<DataTable columns={columns} data={many} pageSize={2} />);
      expect(bodyNames(container)).toEqual(["Person 1", "Person 2"]);
      expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Next page" }));
      expect(bodyNames(container)).toEqual(["Person 3", "Person 4"]);

      fireEvent.click(screen.getByRole("button", { name: "Last page" }));
      expect(bodyNames(container)).toEqual(["Person 5"]);
      expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    });

    it("select-all checks every row on the current page", () => {
      function AllSelection() {
        const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
        return (
          <DataTable
            columns={columns}
            data={people}
            getRowId={(row) => row.id.toString()}
            enableRowSelection
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
          />
        );
      }
      render(<AllSelection />);
      fireEvent.click(screen.getByRole("checkbox", { name: "Select all rows on this page" }));
      for (const box of screen.getAllByRole("checkbox", { name: "Select row" })) {
        expect(box).toBeChecked();
      }
    });

    it("keeps the default 150px header width for unsized columns (v8 parity)", () => {
      // v8 merged size: 150 into every columnDef and DataTable applies any truthy size;
      // react-table 9's columnSizingFeature must give the same default.
      const { container } = render(<DataTable columns={columns} data={people} />);
      expect(container.querySelector("thead th")).toHaveStyle({ width: "150px" });
    });

    it("applies a column def size as the header width", () => {
      const sized: AppColumnDef<Item>[] = [{ accessorKey: "name", header: "Name", size: 240 }];
      const { container } = render(<DataTable columns={sized} data={people} />);
      expect(container.querySelector("thead th")).toHaveStyle({ width: "240px" });
    });
  });
});
