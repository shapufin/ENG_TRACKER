import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DataTable } from "./DataTable";
import type { AppColumnDef } from "@/components/ui/tableTypes";

interface Item {
  id: number;
  name: string;
}

const columns: AppColumnDef<Item>[] = [{ accessorKey: "name", header: "Name" }];
const rows: Item[] = [
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
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

afterEach(() => vi.unstubAllGlobals());

const renderServer = (
  over: Partial<NonNullable<Parameters<typeof DataTable>[0]["server"]>> = {}
) => {
  const server = {
    search: "",
    onSearchChange: vi.fn(),
    page: 2,
    total: 130,
    onPageChange: vi.fn(),
    ...over,
  };
  render(
    <DataTable<Item>
      columns={columns}
      data={rows}
      searchColumn="name"
      searchPlaceholder="Search users..."
      pageSize={50}
      server={server}
    />
  );
  return server;
};

describe("DataTable server mode", () => {
  it("reports the server total and page, not the loaded rows", () => {
    renderServer();
    expect(screen.getByText(/130 results/)).toBeInTheDocument();
    expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument();
  });

  it("does not filter rows client-side; typing is handed to the server", () => {
    const server = renderServer();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search users" }), {
      target: { value: "zzz" },
    });
    expect(server.onSearchChange).toHaveBeenCalledWith("zzz");
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("pages through the server", () => {
    const server = renderServer();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(server.onPageChange).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(server.onPageChange).toHaveBeenCalledWith(1);
  });

  it("disables Next on the last page", () => {
    renderServer({ page: 3 });
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });
});
