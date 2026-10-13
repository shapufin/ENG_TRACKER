import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { createCrudActionsColumn, pillOffsetForEntry } from "./tableColumnHelpers";
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

    expect(screen.getByRole("searchbox", { name: "Search people" })).toBeInTheDocument();
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

      fireEvent.change(screen.getByLabelText("Search people"), { target: { value: "bob@" } });
      expect(bodyNames(container)).toEqual(["Bob"]);
    });

    it("starts filtered when initialSearch is given and the box shows it", () => {
      const { container } = render(
        <DataTable
          columns={columns}
          data={[
            { id: 1, name: "Alice", email: "alice@test.com" },
            { id: 2, name: "Bob", email: "bob@test.com" },
          ]}
          searchColumn={["name", "email"]}
          searchPlaceholder="Search people..."
          initialSearch="bob"
        />
      );
      expect(bodyNames(container)).toEqual(["Bob"]);
      expect(screen.getByLabelText("Search people")).toHaveValue("bob");
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
      fireEvent.change(screen.getByLabelText("Search people"), { target: { value: "admin" } });
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
      fireEvent.change(screen.getByLabelText("Search"), { target: { value: "bo" } });
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

describe("DataTable row actions layout", () => {
  const actionColumns: AppColumnDef<Item>[] = [
    ...columns,
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: () => <button>Go</button>,
    },
  ];
  const renderIt = () =>
    render(
      <DataTable
        columns={actionColumns}
        data={[{ id: 1, name: "Alice", email: "alice@test.com" }]}
        getRowId={(row) => row.id.toString()}
      />
    );

  it("rows carry group/row", () => {
    renderIt();
    expect(screen.getByText("Alice").closest("tr")!.className).toContain("group/row");
  });

  it("actions column is a plain right-aligned column, not a sticky panel", () => {
    // The 2026-10-10 refinement replaced the lift's sticky opaque column with the
    // mockup treatment: the column must be sized by its icons, carry no background
    // of its own, and leave the row's hover/selection tint to show through.
    renderIt();
    const cell = screen.getByText("Go").closest("td")!;
    expect(cell.className).toContain("text-right");
    expect(cell.className).toContain("px-2");
    expect(cell.className).toContain("py-2");
    expect(cell.className).not.toContain("sticky");
    expect(cell.className).not.toContain("bg-card");
    expect(screen.getByText("Actions").closest("th")!.className).toContain("text-right");
    expect(screen.getByText("Alice").closest("td")!.className).not.toContain("text-right");
  });
});

describe("DataTable default column visibility", () => {
  const rows: Item[] = [{ id: 1, name: "Alice", email: "alice@example.com" }];

  beforeEach(() => {
    localStorage.clear();
  });

  it("hides columns from defaultColumnVisibility when nothing is saved", () => {
    render(
      <DataTable
        columns={columns}
        data={rows}
        enableColumnVisibility
        storageKey="test-default-visibility"
        defaultColumnVisibility={{ email: false }}
      />
    );
    expect(screen.queryByRole("columnheader", { name: "Email" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
  });

  it("prefers a saved visibility choice over the default", () => {
    localStorage.setItem("test-default-visibility", JSON.stringify({ _version: 1, email: true }));
    render(
      <DataTable
        columns={columns}
        data={rows}
        enableColumnVisibility
        storageKey="test-default-visibility"
        defaultColumnVisibility={{ email: false }}
      />
    );
    expect(screen.getByRole("columnheader", { name: "Email" })).toBeInTheDocument();
  });
});

const stubPointer = (fine: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: fine && query === "(pointer: fine)",
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));

describe("floating actions pill", () => {
  const actionColumns: AppColumnDef<Item>[] = [
    ...columns,
    {
      id: "actions",
      header: "Actions",
      cell: () => <button aria-label="Edit 1">Edit</button>,
    },
  ];
  const data: Item[] = [{ id: 1, name: "Alice", email: "alice@test.com" }];

  it("fine pointer renders the actions cell in a floating toolbar, not a column", () => {
    stubPointer(true);
    const { container } = render(
      <DataTable columns={actionColumns} data={data} getRowId={(row) => row.id.toString()} />
    );
    const toolbar = screen.getByRole("toolbar", { name: "Row actions" });
    expect(toolbar).toContainElement(screen.getByRole("button", { name: "Edit 1" }));
    expect(screen.queryByRole("columnheader", { name: "Actions" })).not.toBeInTheDocument();
    const phantomHead = container.querySelector("thead th:last-child");
    expect(phantomHead?.className).toContain("w-0");
    expect(phantomHead).toHaveAttribute("aria-hidden", "true");
    expect(toolbar.closest("td")?.className).toContain("w-0");
    expect(toolbar.closest("td")?.className).not.toContain("text-right");
  });

  it("coarse pointer keeps the actions column as today", () => {
    stubPointer(false);
    render(<DataTable columns={actionColumns} data={data} getRowId={(row) => row.id.toString()} />);
    expect(screen.getByRole("columnheader", { name: "Actions" })).toBeInTheDocument();
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit 1" }).closest("td")?.className).toContain(
      "text-right"
    );
  });

  it("a column-level actionsDisplay meta keeps the column on a fine pointer", () => {
    stubPointer(true);
    const withMeta: AppColumnDef<Item>[] = [
      ...columns,
      {
        id: "actions",
        header: "Actions",
        meta: { actionsDisplay: "column" },
        cell: () => <button>Approve</button>,
      },
    ];
    render(<DataTable columns={withMeta} data={data} getRowId={(row) => row.id.toString()} />);
    expect(screen.getByRole("columnheader", { name: "Actions" })).toBeInTheDocument();
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("an approval helper column keeps its pending Approve button visible without hover", () => {
    stubPointer(true);
    type Pending = { id: number; status: string; name: string };
    const pendingRows: Pending[] = [{ id: 7, status: "pending", name: "Dana" }];
    const approvalColumns: AppColumnDef<Pending>[] = [
      { accessorKey: "name", header: "Name" },
      createCrudActionsColumn<Pending>({
        canApprove: true,
        onApprove: () => {},
        onReject: () => {},
        onEdit: () => {},
        onDelete: () => {},
      }),
    ];
    render(
      <DataTable columns={approvalColumns} data={pendingRows} getRowId={(r) => r.id.toString()} />
    );
    expect(screen.getByRole("columnheader", { name: "Actions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve 7" })).toBeVisible();
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("pill reveal is hover/focus-only with a pointer-events guard", () => {
    stubPointer(true);
    render(<DataTable columns={actionColumns} data={data} getRowId={(row) => row.id.toString()} />);
    const { className } = screen.getByRole("toolbar", { name: "Row actions" });
    for (const token of [
      "opacity-0",
      "pointer-events-none",
      "group-hover/row:opacity-100",
      "group-focus-within/row:opacity-100",
    ]) {
      expect(className).toContain(token);
    }
  });

  it("hides the pill chrome when the action cell renders nothing actionable", () => {
    stubPointer(true);
    const emptyCells: AppColumnDef<Item>[] = [
      ...columns,
      { id: "actions", header: "Actions", cell: () => <span>-</span> },
    ];
    render(<DataTable columns={emptyCells} data={data} getRowId={(row) => row.id.toString()} />);
    expect(screen.getByRole("toolbar").className).toContain(
      "[&:not(:has(button,a,[role=button]))]:hidden"
    );
  });

  it("mouse enter stores the cursor offset on the row", () => {
    stubPointer(true);
    const { container } = render(
      <DataTable columns={actionColumns} data={data} getRowId={(row) => row.id.toString()} />
    );
    const row = container.querySelector("tbody tr") as HTMLElement;
    fireEvent.mouseEnter(row, { clientX: 50 });
    expect(row.style.getPropertyValue("--row-pill-offset")).not.toBe("");
  });

  it("actions are never offered in the Columns menu", () => {
    stubPointer(true);
    render(
      <DataTable
        columns={actionColumns}
        data={data}
        enableColumnVisibility
        getRowId={(row) => row.id.toString()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Columns \(2\/2\)/ }));
    expect(screen.queryByRole("checkbox", { name: "Actions" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Email" })).toBeInTheDocument();
  });

  it("a persisted actions:false visibility is ignored", () => {
    stubPointer(false);
    localStorage.setItem(
      "table-visibility-pill-test",
      JSON.stringify({ _version: 1, actions: false })
    );
    render(
      <DataTable
        columns={actionColumns}
        data={data}
        enableColumnVisibility
        storageKey="table-visibility-pill-test"
        getRowId={(row) => row.id.toString()}
      />
    );
    expect(screen.getByRole("button", { name: "Edit 1" })).toBeInTheDocument();
  });

  it("Enter on a row checkbox does not fire onRowClick, but Enter on the row does", () => {
    stubPointer(true);
    const onRowClick = vi.fn();
    const { container } = render(
      <DataTable
        columns={columns}
        data={data}
        enableRowSelection
        rowSelection={{}}
        onRowSelectionChange={() => {}}
        onRowClick={onRowClick}
        getRowId={(row) => row.id.toString()}
      />
    );
    fireEvent.keyDown(screen.getByRole("checkbox", { name: "Select row" }), { key: "Enter" });
    expect(onRowClick).not.toHaveBeenCalled();
    fireEvent.keyDown(container.querySelector("tbody tr") as HTMLElement, { key: "Enter" });
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it("pageSize prop updates pagination when it changes", () => {
    stubPointer(false);
    const many: Item[] = Array.from({ length: 3 }, (_, i) => ({
      id: i + 1,
      name: `P${i + 1}`,
      email: `p${i + 1}@test.com`,
    }));
    const { rerender } = render(<DataTable columns={columns} data={many} pageSize={10} />);
    expect(screen.queryByText(/Page 1 of/)).not.toBeInTheDocument();
    rerender(<DataTable columns={columns} data={many} pageSize={1} />);
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
  });

  it("renders no toolbar when there is no actions column", () => {
    stubPointer(true);
    render(<DataTable columns={columns} data={data} />);
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });
});

describe("pillOffsetForEntry", () => {
  it("centers the pill on the entry point when nothing is near an edge", () => {
    // clientX=800 on a row starting at viewport 300: offset is row-relative.
    expect(pillOffsetForEntry(800, { left: 300, width: 1000 }, 400, 1600)).toBe("-500px");
  });

  it("clamps to the viewport right edge on a scrolled table (pill never bleeds off-screen)", () => {
    // Regression: the old row-relative 140px guess parked a 444px pill at
    // viewport 1426 on a 1600px screen (48px cut off). The clamp is
    // viewport-relative now: center=1370, offset measured from the row box.
    expect(pillOffsetForEntry(1528, { left: 176, width: 1390 }, 444, 1600)).toBe("-196px");
  });

  it("clamps to the viewport left edge", () => {
    expect(pillOffsetForEntry(10, { left: -500, width: 1390 }, 444, 1600)).toBe("-660px");
  });

  it("stays finite when the pill is wider than the viewport", () => {
    expect(pillOffsetForEntry(200, { left: 0, width: 300 }, 500, 400)).toBe("-158px");
  });

  it("clamps to the scroll container's clip rect, which is tighter than the viewport", () => {
    // Regression: the pill renders inside the overflow-x-auto content, so the
    // card edge clips it ~50px before the viewport edge in the admin shell.
    // clip={left:314,right:1390} on a 1440 viewport: hi = 1390-230 = 1160.
    expect(
      pillOffsetForEntry(1380, { left: 314, width: 1393 }, 444, 1440, { left: 314, right: 1390 })
    ).toBe("-547px");
    // Same entry without the clip rect clamps to the viewport (hi=1440-230=1210).
    expect(pillOffsetForEntry(1380, { left: 314, width: 1393 }, 444, 1440)).toBe("-497px");
    // Clip left edge too: entry at clientX inside clip.left clamps rightward.
    expect(
      pillOffsetForEntry(300, { left: -500, width: 1390 }, 444, 1440, { left: 314, right: 1390 })
    ).toBe(`${314 + 230 - -500 - 1390}px`);
  });
});
