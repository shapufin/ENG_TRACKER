import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LeaveUserGroupedTable } from "./LeaveUserGroupedTable";
import type { LeaveRequest } from "@/types";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const mockRequests: LeaveRequest[] = [
  // User 1 (Xhuliana) has 3 requests (2 approved vacation, 1 pending sick)
  {
    id: 1,
    user: 10,
    user_name: "xhuliana.sina",
    user_full_name: "Xhuliana Sina",
    team_name: "Core Platform",
    user_leave_balance: 10,
    request_type: "vacation",
    start_date: "2026-11-26",
    end_date: "2026-11-27",
    days_requested: 2,
    status: "approved",
    reason: "",
    approved_by: 1,
    approved_at: "2026-11-02T10:00:00Z",
    rejection_reason: "",
    created_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-02T10:00:00Z",
  },
  {
    id: 2,
    user: 10,
    user_name: "xhuliana.sina",
    user_full_name: "Xhuliana Sina",
    team_name: "Core Platform",
    user_leave_balance: 10,
    request_type: "vacation",
    start_date: "2026-12-01",
    end_date: "2026-12-05",
    days_requested: 5,
    status: "approved",
    reason: "",
    approved_by: 1,
    approved_at: "2026-11-02T10:00:00Z",
    rejection_reason: "",
    created_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-02T10:00:00Z",
  },
  {
    id: 3,
    user: 10,
    user_name: "xhuliana.sina",
    user_full_name: "Xhuliana Sina",
    team_name: "Core Platform",
    user_leave_balance: 10,
    request_type: "sick",
    start_date: "2026-12-10",
    end_date: "2026-12-10",
    days_requested: 1,
    status: "pending",
    reason: "",
    approved_by: null,
    approved_at: null,
    rejection_reason: "",
    created_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-02T10:00:00Z",
  },
  // User 2 (Elton) has 2 requests
  {
    id: 4,
    user: 20,
    user_name: "elton.ngresi",
    user_full_name: "Elton Ngresi",
    team_name: "Infra SRE",
    user_leave_balance: 4,
    request_type: "vacation",
    start_date: "2026-10-19",
    end_date: "2026-10-23",
    days_requested: 5,
    status: "approved",
    reason: "",
    approved_by: 1,
    approved_at: "2026-10-02T10:00:00Z",
    rejection_reason: "",
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-02T10:00:00Z",
  },
  {
    id: 5,
    user: 20,
    user_name: "elton.ngresi",
    user_full_name: "Elton Ngresi",
    team_name: "Infra SRE",
    user_leave_balance: 4,
    request_type: "vacation",
    start_date: "2026-11-02",
    end_date: "2026-11-06",
    days_requested: 5,
    status: "approved",
    reason: "",
    approved_by: 1,
    approved_at: "2026-10-02T10:00:00Z",
    rejection_reason: "",
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-02T10:00:00Z",
  },
];

describe("LeaveUserGroupedTable", () => {
  const dummyServer = {
    search: "",
    onSearchChange: vi.fn(),
    page: 1,
    total: 5,
    onPageChange: vi.fn(),
  };

  it("consolidates multiple requests per user into single rows", () => {
    render(
      <LeaveUserGroupedTable requests={mockRequests} onSelectUser={vi.fn()} server={dummyServer} />
    );

    // Xhuliana and Elton should each appear as one distinct employee row
    expect(screen.getByText("Xhuliana Sina")).toBeInTheDocument();
    expect(screen.getByText("@xhuliana.sina")).toBeInTheDocument();
    expect(screen.getByText("Elton Ngresi")).toBeInTheDocument();
    expect(screen.getByText("@elton.ngresi")).toBeInTheDocument();

    // Xhuliana: 3 requests, 8 days, 1 pending
    expect(screen.getByText("3 requests")).toBeInTheDocument();
    expect(screen.getByText("8 days")).toBeInTheDocument();
    expect(screen.getByText("1 pending")).toBeInTheDocument();

    // Elton: 2 requests, 10 days, 0 pending
    expect(screen.getByText("2 requests")).toBeInTheDocument();
    expect(screen.getByText("10 days")).toBeInTheDocument();
  });

  it("triggers onSelectUser when View Vacations button is clicked", () => {
    const onSelectUser = vi.fn();
    render(
      <LeaveUserGroupedTable
        requests={mockRequests}
        onSelectUser={onSelectUser}
        server={dummyServer}
      />
    );

    const xhulianaBtn = screen.getByRole("button", { name: "View vacations for Xhuliana Sina" });
    fireEvent.click(xhulianaBtn);

    expect(onSelectUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 10,
        userFullName: "Xhuliana Sina",
        totalRequests: 3,
        totalDays: 8,
      })
    );
  });
});
