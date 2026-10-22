import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HoursLogDataTable } from "./HoursLogDataTable";

vi.mock("@/components/ui/DataTable", () => ({
  DataTable: ({ data }: { data: { id: number; status: string }[] }) => (
    <ul>
      {data.map((r) => (
        <li key={r.id}>{`row-${r.id}`}</li>
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
