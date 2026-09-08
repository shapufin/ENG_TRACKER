import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LeaveRequestsTable } from "./LeaveRequestsTable";
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
  id: 1,
  user_name: "Alice",
  request_type: "vacation",
  start_date: "2026-09-10",
  end_date: "2026-09-12",
  days_requested: 3,
  user_leave_balance: 10,
  reason: "Family trip",
  status: "pending",
} as unknown as LeaveRequest;

describe("LeaveRequestsTable action buttons", () => {
  it("gives approve/reject/delete icon buttons accessible names", () => {
    // Audit 2026-09-07: ApprovalActionsColumn buttons were unnamed; the
    // delete button relied on title alone (weak accessible name).
    render(
      <LeaveRequestsTable
        requests={[request]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onDelete={vi.fn()}
        canDelete
      />
    );
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete leave request" })).toBeInTheDocument();
  });
});
