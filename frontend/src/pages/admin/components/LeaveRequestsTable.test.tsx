import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

  it("reject opens the reason ConfirmDialog instead of a native prompt()", () => {
    // Design audit 2026-09-11: reject used window.prompt() directly, banned
    // by CLAUDE.md's "no native dialogs" rule. Must route through
    // ConfirmDialog + Input like every other reject flow in the app.
    const nativePrompt = vi.spyOn(window, "prompt");
    const onReject = vi.fn();
    render(<LeaveRequestsTable requests={[request]} onApprove={vi.fn()} onReject={onReject} />);

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(nativePrompt).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog", { name: /reject request/i });
    fireEvent.change(screen.getByPlaceholderText("Rejection reason"), {
      target: { value: "Understaffed that week" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /reject/i }));

    expect(onReject).toHaveBeenCalledWith(1, "Understaffed that week");
  });
});
