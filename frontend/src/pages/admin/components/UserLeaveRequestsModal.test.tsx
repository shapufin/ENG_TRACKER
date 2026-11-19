import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserLeaveRequestsModal } from "./UserLeaveRequestsModal";
import { leaveService } from "@/services/leaveService";
import type { LeaveRequest } from "@/types";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

vi.mock("@/services/leaveService", () => ({
  leaveService: {
    getAdminRequests: vi.fn(),
  },
}));

const mockRequests: LeaveRequest[] = [
  {
    id: 101,
    user: 42,
    user_name: "xhuliana.sina",
    user_full_name: "Xhuliana Sina",
    team_name: "Engineering Core",
    user_leave_balance: 14,
    request_type: "vacation",
    start_date: "2026-11-26",
    end_date: "2026-11-27",
    days_requested: 2,
    status: "approved",
    reason: "Family gathering",
    approved_by: 1,
    approved_at: "2026-11-02T10:00:00Z",
    rejection_reason: "",
    created_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-02T10:00:00Z",
  },
  {
    id: 102,
    user: 42,
    user_name: "xhuliana.sina",
    user_full_name: "Xhuliana Sina",
    team_name: "Engineering Core",
    user_leave_balance: 14,
    request_type: "sick",
    start_date: "2026-12-05",
    end_date: "2026-12-05",
    days_requested: 1,
    status: "pending",
    reason: "Doctor appointment",
    approved_by: null,
    approved_at: null,
    rejection_reason: "",
    created_at: "2026-11-10T10:00:00Z",
    updated_at: "2026-11-10T10:00:00Z",
  },
];

const mockUser = {
  userId: 42,
  userName: "xhuliana.sina",
  userFullName: "Xhuliana Sina",
  teamName: "Engineering Core",
  userLeaveBalance: 14,
};

describe("UserLeaveRequestsModal", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(leaveService.getAdminRequests).mockResolvedValue({
      results: mockRequests,
      count: 2,
      next: null,
      previous: null,
    });
  });

  const renderModal = (props: Partial<React.ComponentProps<typeof UserLeaveRequestsModal>> = {}) =>
    render(
      <QueryClientProvider client={queryClient}>
        <UserLeaveRequestsModal
          user={mockUser}
          open={true}
          onOpenChange={vi.fn()}
          onApprove={vi.fn()}
          onReject={vi.fn()}
          onDelete={vi.fn()}
          canDelete={true}
          {...props}
        />
      </QueryClientProvider>
    );

  it("renders employee identity and summary metrics in header", async () => {
    renderModal();

    expect(screen.getByText("Xhuliana Sina")).toBeInTheDocument();
    expect(screen.getByText("@xhuliana.sina")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/requests ·/i)).toBeInTheDocument();
      expect(screen.getByText(/days total/i)).toBeInTheDocument();
      expect(screen.getByText(/1 pending/i)).toBeInTheDocument();
    });
  });

  it("renders single-row range bar with start date, end date, and total days", async () => {
    renderModal();

    await waitFor(() => {
      // 26/11/2026 -> 27/11/2026
      expect(screen.getByText("26/11/2026")).toBeInTheDocument();
      expect(screen.getByText("27/11/2026")).toBeInTheDocument();
      expect(screen.getByText("2 days")).toBeInTheDocument();

      // Sick leave 05/12/2026
      expect(screen.getAllByText("05/12/2026")).toHaveLength(2);
      expect(screen.getByText("1 day")).toBeInTheDocument();
    });
  });

  it("renders vacation and sick leave badges with correct statuses", async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByText("Vacation")).toBeInTheDocument();
      expect(screen.getByText("Sick Leave")).toBeInTheDocument();
      expect(screen.getByText("Approved")).toBeInTheDocument();
      expect(screen.getByText("Pending")).toBeInTheDocument();
    });
  });

  it("calls onApprove when approve button is clicked for pending item", async () => {
    const onApprove = vi.fn();
    renderModal({ onApprove });

    await waitFor(() => {
      const approveBtn = screen.getByRole("button", {
        name: /Approve leave from 05\/12\/2026 to 05\/12\/2026/i,
      });
      fireEvent.click(approveBtn);
    });

    expect(onApprove).toHaveBeenCalledWith(102);
  });

  it("opens reject reason dialog and submits reason", async () => {
    const onReject = vi.fn();
    renderModal({ onReject });

    await waitFor(() => {
      const rejectBtn = screen.getByRole("button", {
        name: /Reject leave from 05\/12\/2026 to 05\/12\/2026/i,
      });
      fireEvent.click(rejectBtn);
    });

    expect(screen.getByText("Reject Leave Request")).toBeInTheDocument();
    const reasonInput = screen.getByPlaceholderText(/Reason for rejection/i);
    fireEvent.change(reasonInput, { target: { value: "Insufficient staffing" } });

    const confirmRejectBtn = screen.getByRole("button", { name: "Reject Request" });
    fireEvent.click(confirmRejectBtn);

    expect(onReject).toHaveBeenCalledWith(102, "Insufficient staffing");
  });

  it("shows empty state when employee has no requests", async () => {
    vi.mocked(leaveService.getAdminRequests).mockResolvedValue({
      results: [],
      count: 0,
      next: null,
      previous: null,
    });

    renderModal();

    await waitFor(() => {
      expect(screen.getByText("No leave records found")).toBeInTheDocument();
    });
  });
});
