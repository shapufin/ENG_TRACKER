import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import type { AdminOverview } from "@/types";
import { AdminInsightsStrip } from "./AdminInsightsStrip";

const state: { data?: AdminOverview; isLoading: boolean; isError: boolean; userId?: number } = {
  isLoading: false,
  isError: false,
  userId: 1,
};
const refetch = vi.fn();

vi.mock("@/hooks/useAdminDashboardQueries", () => ({
  useAdminOverview: () => ({
    data: state.data,
    isLoading: state.isLoading,
    isError: state.isError,
    refetch,
  }),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: state.userId ? { id: state.userId } : null }),
}));

const base = (): AdminOverview => ({
  headcount: {
    total_users: 1,
    active_users: 1,
    inactive_users: 0,
    new_hires_30d: 0,
    never_logged_in: 0,
  },
  coverage_gaps: {
    teams_without_leader: 0,
    users_without_team: 0,
    users_without_tech: 0,
    employees_without_tl: 0,
    al_tls_without_hbpr_assignment: 0,
  },
  pending_backlog: {
    overtime: { count: 0, hours: 0 },
    standby: { count: 0, hours: 0 },
    leave: { count: 0, days: 0 },
  },
  approval_aging: {
    buckets: [],
    overtime: [0, 0, 0, 3],
    standby: [0, 0, 0, 0],
    leave: [0, 0, 0, 0],
  },
  leave_utilization: {
    year: 2026,
    total_days: 0,
    used_days: 0,
    pending_days: 0,
    available_days: 0,
    utilization_pct: null,
  },
  carryover_expiry: { window_days: 60, days_at_risk: 0, users_affected: 0 },
  period_close: { period: "2026-09", tls_total: 4, tls_closed: 4, tls_open: 0, open_tls: [] },
  backup: null,
});

const Where = () => <div data-testid="where">{useLocation().pathname}</div>;

const renderStrip = () =>
  render(
    <MemoryRouter initialEntries={["/admin"]}>
      <AdminInsightsStrip />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  cleanup();
  localStorage.clear();
  state.data = base();
  state.isLoading = false;
  state.isError = false;
  state.userId = 1;
  refetch.mockClear();
});

describe("AdminInsightsStrip", () => {
  it("renders an accessible region with the first insight", () => {
    renderStrip();
    expect(screen.getByRole("region", { name: "Automated insights" })).toBeInTheDocument();
    expect(screen.getByText("Approvals waiting over 15 days")).toBeInTheDocument();
  });

  it("pages through several insights", () => {
    state.data!.coverage_gaps.teams_without_leader = 2;
    renderStrip();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next insight" }));
    expect(screen.getByText("Teams without a leader")).toBeInTheDocument();
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous insight" }));
    expect(screen.getByText("Approvals waiting over 15 days")).toBeInTheDocument();
  });

  it("navigates to the insight target", () => {
    renderStrip();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/admin/overtime-logs");
  });

  it("dismisses an insight and keeps it dismissed", () => {
    const { unmount } = renderStrip();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss insight" }));
    expect(screen.queryByText("Approvals waiting over 15 days")).not.toBeInTheDocument();
    unmount();
    renderStrip();
    expect(screen.queryByText("Approvals waiting over 15 days")).not.toBeInTheDocument();
  });

  it("shows a dismissed insight again when its number changes", () => {
    const { unmount } = renderStrip();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss insight" }));
    unmount();
    state.data!.approval_aging.overtime = [0, 0, 0, 7];
    renderStrip();
    expect(screen.getByText("Approvals waiting over 15 days")).toBeInTheDocument();
  });

  it("does not leak dismissals to another user on the same browser", () => {
    const { unmount } = renderStrip();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss insight" }));
    unmount();
    state.userId = 2;
    renderStrip();
    expect(screen.getByText("Approvals waiting over 15 days")).toBeInTheDocument();
  });

  it("survives localStorage throwing", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderStrip();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss insight" }));
    expect(screen.queryByText("Approvals waiting over 15 days")).not.toBeInTheDocument();
    get.mockRestore();
    set.mockRestore();
  });

  it("renders nothing while loading and a retry on error", () => {
    state.data = undefined;
    state.isLoading = true;
    const { container, unmount } = renderStrip();
    expect(container.querySelector("[aria-label='Automated insights']")).toBeNull();
    unmount();
    state.isLoading = false;
    state.isError = true;
    renderStrip();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("states severity in text, not colour alone", () => {
    renderStrip();
    expect(screen.getByText("Warning")).toBeInTheDocument();
  });

  it("separates severity and title with a middle dot, never a replacement character", () => {
    renderStrip();
    const region = screen.getByRole("region", { name: "Automated insights" });
    expect(region.textContent).not.toContain("�");
    expect(region.textContent).toContain("Warning·Approvals waiting over 15 days");
  });

  it("opens and closes the full message from a button", () => {
    renderStrip();
    const message = screen.getByRole("button", { expanded: false, name: /15 days|over|waiting/i });
    expect(message).toHaveClass("truncate");
    fireEvent.click(message);
    expect(message).toHaveAttribute("aria-expanded", "true");
    expect(message).not.toHaveClass("truncate");
    fireEvent.click(message);
    expect(message).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps focus on the pager while paging", () => {
    state.data!.coverage_gaps.teams_without_leader = 2;
    renderStrip();
    const next = screen.getByRole("button", { name: "Next insight" });
    next.focus();
    fireEvent.click(next);
    expect(screen.getByRole("button", { name: "Next insight" })).toBe(next);
    expect(next).toHaveFocus();
  });

  it("moves focus to the active section tab when the last insight is dismissed", () => {
    render(
      <MemoryRouter>
        <div role="tablist">
          <button role="tab" aria-selected="true">
            All
          </button>
        </div>
        <AdminInsightsStrip />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss insight" }));
    expect(screen.getByRole("tab", { name: "All" })).toHaveFocus();
  });
});
