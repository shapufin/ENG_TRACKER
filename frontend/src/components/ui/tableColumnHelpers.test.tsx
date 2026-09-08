import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  createCrudActionsColumn,
  createEditDeleteActionsColumn,
  createViewApproveRejectActionsColumn,
} from "./tableColumnHelpers";

type Row = { id: number; status: "pending" | "approved"; name: string };

const row: Row = { id: 7, status: "pending", name: "Alice" };

const renderCell = (column: ColumnDef<Row>, value = row) => {
  if (typeof column.cell !== "function") throw new Error("Expected a cell renderer");
  const cell = column.cell as (context: { row: { original: Row } }) => React.ReactNode;
  return render(<>{cell({ row: { original: value } })}</>);
};

describe("table column action helpers", () => {
  it("wires edit and delete callbacks", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const { container } = renderCell(createEditDeleteActionsColumn<Row>(onEdit, onDelete));
    const buttons = container.querySelectorAll("button");

    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    expect(onEdit).toHaveBeenCalledWith(row);
    expect(onDelete).toHaveBeenCalledWith(row);
  });

  it("shows CRUD approval actions only for pending rows when allowed", () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const column = createCrudActionsColumn<Row>({
      canApprove: true,
      onApprove,
      onReject,
      onEdit,
      onDelete,
    });
    const { container, rerender } = renderCell(column);
    let buttons = container.querySelectorAll("button");

    expect(buttons).toHaveLength(4);
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    fireEvent.click(buttons[2]);
    fireEvent.click(buttons[3]);
    expect(onApprove).toHaveBeenCalledWith(7);
    expect(onReject).toHaveBeenCalledWith(7);
    expect(onEdit).toHaveBeenCalledWith(row);
    expect(onDelete).toHaveBeenCalledWith(7);

    rerender(
      <>
        {(column.cell as (context: { row: { original: Row } }) => React.ReactNode)({
          row: { original: { ...row, status: "approved" } },
        })}
      </>
    );
    buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(2);
  });

  it("wires team view and approval actions and respects pending state", () => {
    const onView = vi.fn();
    const approveMutate = vi.fn();
    const onReject = vi.fn();
    const column = createViewApproveRejectActionsColumn<Row>({
      onView,
      approveMutate,
      approvePending: true,
      onReject,
      rejectPending: false,
    });
    const { container } = renderCell(column);
    const buttons = container.querySelectorAll("button");

    expect(buttons).toHaveLength(3);
    expect(buttons[1]).toBeDisabled();
    expect(buttons[2]).not.toBeDisabled();
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[2]);
    expect(onView).toHaveBeenCalledWith(row);
    expect(onReject).toHaveBeenCalledWith(7);
    expect(approveMutate).not.toHaveBeenCalled();
  });

  it("disables edit and delete buttons and renders lock tooltip when canEdit/canDelete return false", () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const column = createCrudActionsColumn<Row>({
      canApprove: true,
      onApprove,
      onReject,
      onEdit,
      onDelete,
      canEdit: () => false,
      canDelete: () => false,
    });
    const { container } = renderCell(column);
    const buttons = container.querySelectorAll("button");

    // approve + reject (enabled) + edit (disabled) + delete (disabled)
    expect(buttons).toHaveLength(4);
    expect(buttons[0]).not.toBeDisabled();
    expect(buttons[1]).not.toBeDisabled();
    expect(buttons[2]).toBeDisabled();
    expect(buttons[3]).toBeDisabled();

    // Clicking disabled buttons must not fire callbacks.
    fireEvent.click(buttons[2]);
    fireEvent.click(buttons[3]);
    expect(onEdit).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("keeps edit and delete enabled when canEdit/canDelete return true", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const column = createCrudActionsColumn<Row>({
      canApprove: false,
      onApprove: vi.fn(),
      onReject: vi.fn(),
      onEdit,
      onDelete,
      canEdit: () => true,
      canDelete: () => true,
    });
    const { container } = renderCell(column);
    const buttons = container.querySelectorAll("button");

    expect(buttons).toHaveLength(2);
    expect(buttons[0]).not.toBeDisabled();
    expect(buttons[1]).not.toBeDisabled();
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    expect(onEdit).toHaveBeenCalledWith(row);
    expect(onDelete).toHaveBeenCalledWith(7);
  });
});
