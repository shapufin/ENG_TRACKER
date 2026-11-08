import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HoursLogDataTable } from "./HoursLogDataTable";

vi.mock("@/components/ui/DataTable", () => ({
  DataTable: ({
    data,
    onRowClick,
  }: {
    data: { id: number; status: string }[];
    onRowClick?: (row: { id: number; status: string }) => void;
  }) => (
    <ul>
      {data.map((r) => (
        <li key={r.id} onClick={() => onRowClick?.(r)}>{`row-${r.id}`}</li>
      ))}
    </ul>
  ),
}));

const data = [
  { id: 1, status: "pending" },
  { id: 2, status: "approved" },
  { id: 3, status: "approved" },
];

describe("HoursLogDataTable status chips", () => {
  it("filters rows by status, shows counts, and clears hidden selection", () => {
    const onRowSelectionChange = vi.fn();
    render(
      <HoursLogDataTable
        columns={[]}
        data={data}
        rowSelection={{ "1": true }}
        onRowSelectionChange={onRowSelectionChange}
        storageKey="t"
      />
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    const approved = screen.getByRole("button", { name: /Approved/ });
    expect(approved).toHaveTextContent("2");
    expect(approved).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(approved);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["row-2", "row-3"]);
    expect(screen.getByRole("button", { name: /Approved/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(onRowSelectionChange).toHaveBeenCalledWith({});

    fireEvent.click(screen.getByRole("button", { name: /Approved/ }));
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});

describe("HoursLogDataTable row tap", () => {
  it("passes the tapped row to onRowClick", () => {
    const onRowClick = vi.fn();
    render(
      <HoursLogDataTable
        columns={[]}
        data={data}
        rowSelection={{}}
        onRowSelectionChange={vi.fn()}
        storageKey="t"
        onRowClick={onRowClick}
      />
    );
    fireEvent.click(screen.getByText("row-2"));
    expect(onRowClick).toHaveBeenCalledWith(data[1]);
  });
});
