import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { LeaveRequestsTable } from "./LeaveRequestsTable";
import type { LeaveRequest } from "@/types";

const server = { search: "", onSearchChange: () => {}, page: 1, total: 2, onPageChange: () => {} };

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
        server={server}
        requests={[request]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onDelete={vi.fn()}
        canDelete
      />
    );
    expect(screen.getByRole("button", { name: "Approve 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete 1" })).toBeInTheDocument();
  });

  it("reject opens the reason ConfirmDialog instead of a native prompt()", () => {
    // Design audit 2026-09-11: reject used window.prompt() directly, banned
    // by CLAUDE.md's "no native dialogs" rule. Must route through
    // ConfirmDialog + Input like every other reject flow in the app.
    const nativePrompt = vi.spyOn(window, "prompt");
    const onReject = vi.fn();
    render(
      <LeaveRequestsTable
        server={server}
        requests={[request]}
        onApprove={vi.fn()}
        onReject={onReject}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Reject 1" }));
    expect(nativePrompt).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog", { name: /reject request/i });
    fireEvent.change(screen.getByPlaceholderText("Rejection reason"), {
      target: { value: "Understaffed that week" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /reject/i }));

    expect(onReject).toHaveBeenCalledWith(1, "Understaffed that week");
  });

  it("delete asks for confirmation before calling onDelete", () => {
    const onDelete = vi.fn();
    render(
      <LeaveRequestsTable
        server={server}
        requests={[request]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onDelete={onDelete}
        canDelete
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete 1" }));
    expect(onDelete).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: /delete leave request/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /^delete$/i }));
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it("offers approve/reject only for pending requests and hides delete without permission", () => {
    const approved = { ...request, status: "approved" } as LeaveRequest;
    render(
      <LeaveRequestsTable
        server={server}
        requests={[approved]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "Approve 1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject 1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete 1" })).not.toBeInTheDocument();
  });

  it("renders pending approve/reject as always-visible inline buttons with text", () => {
    // AdminGUI comparison 2026-10-11: approval decisions must be discoverable
    // without hovering — icon-only hover-reveal actions hide the row's point.
    render(
      <LeaveRequestsTable
        server={server}
        requests={[request]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Approve 1" })).toHaveTextContent("Approve");
    expect(screen.getByRole("button", { name: "Reject 1" })).toHaveTextContent("Reject");
  });

  it("calls onApprove immediately without a dialog", () => {
    const onApprove = vi.fn();
    render(
      <LeaveRequestsTable
        server={server}
        requests={[request]}
        onApprove={onApprove}
        onReject={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve 1" }));
    expect(onApprove).toHaveBeenCalledWith(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("LeaveRequestsTable day labels", () => {
  it("uses the singular for a one-day request", () => {
    const oneDay = {
      ...request,
      start_date: "2026-09-10",
      end_date: "2026-09-10",
      days_requested: 1,
    } as unknown as LeaveRequest;
    render(
      <LeaveRequestsTable
        server={server}
        requests={[oneDay]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(screen.queryByText(/\b1 days\b/)).toBeNull();
    expect(screen.getAllByText("1 day").length).toBeGreaterThan(0);
  });
});

describe("LeaveRequestsTable toolbar", () => {
  it("renders the page's filters in the same toolbar row as Columns", () => {
    render(
      <LeaveRequestsTable
        server={server}
        requests={[request]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        toolbar={<span>page filters</span>}
        header={<span>status chips</span>}
      />
    );
    const toolbar = document.querySelector("[data-filter-toolbar]") as HTMLElement;
    expect(within(toolbar).getByText("page filters")).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: /columns/i })).toBeInTheDocument();
    expect(toolbar.contains(screen.getByText("status chips"))).toBe(false);
  });
});
