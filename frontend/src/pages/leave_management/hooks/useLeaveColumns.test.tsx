import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DataTable } from "@/components/ui/DataTable";
import { useLeaveColumns } from "./useLeaveColumns";
import type { LeaveRequest } from "@/types";

// DataTable (TanStack) needs ResizeObserver, which jsdom lacks.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const request = {
  id: 3,
  user_name: "Bob",
  request_type: "vacation",
  start_date: "2026-09-10",
  end_date: "2026-09-12",
  days_requested: 3,
  user_leave_balance: 10,
  reason: "Trip",
  status: "pending",
} as unknown as LeaveRequest;

const renderTable = (
  over: {
    canApprove?: boolean;
    onEdit?: (req: LeaveRequest) => void;
    onDelete?: (id: number) => void;
    canDelete?: (req: LeaveRequest) => boolean;
    onApprove?: (id: number) => void;
    onReject?: (id: number) => void;
  } = {}
) => {
  const props = {
    canApprove: true,
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    canDelete: () => true,
    onApprove: vi.fn(),
    onReject: vi.fn(),
    ...over,
  };
  const Harness: React.FC = () => {
    const columns = useLeaveColumns(
      props.canApprove,
      props.onEdit,
      props.onDelete,
      props.canDelete,
      props.onApprove,
      props.onReject
    );
    return <DataTable columns={columns} data={[request]} getRowId={(row) => String(row.id)} />;
  };
  render(<Harness />);
  return props;
};

describe("useLeaveColumns actions", () => {
  it("renders inline Approve/Reject for pending rows plus named edit/delete actions", () => {
    renderTable();
    expect(screen.getByRole("button", { name: "Approve request 3" })).toHaveTextContent("Approve");
    expect(screen.getByRole("button", { name: "Reject request 3" })).toHaveTextContent("Reject");
    expect(screen.getByRole("button", { name: "Edit request 3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete request 3" })).toBeInTheDocument();
  });

  it("hides decisions without approval rights and without delete rights", () => {
    renderTable({ canApprove: false, canDelete: () => false });
    expect(screen.queryByRole("button", { name: "Approve request 3" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject request 3" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete request 3" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit request 3" })).toBeInTheDocument();
  });

  it("confirms delete before calling onDelete", () => {
    const props = renderTable();
    fireEvent.click(screen.getByRole("button", { name: "Delete request 3" }));
    expect(props.onDelete).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: /delete request/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /^delete$/i }));
    expect(props.onDelete).toHaveBeenCalledWith(3);
  });
});
