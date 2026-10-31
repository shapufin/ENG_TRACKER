import { beforeAll, describe, it, expect, vi } from "vitest";
import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HRDashboardView } from "./HRDashboardView";

// HRQuickLinks renders <Link>s, so every case needs a router in scope.
const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: MemoryRouter });

// DataTable observes its scroll container; jsdom has no ResizeObserver.
beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

vi.mock("@/components/ui/GlassCard", () => ({
  GlassCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

const baseProps = {
  hrStats: { pending_overtime: 4, pending_standby: 2, pending_leaves: 1 },
  monthlyData: [{ day: "Oct", overtime: 12, standby: 4 }],
  statusBars: [
    { label: "Pending", value: 7 },
    { label: "Approved", value: 40 },
    { label: "Rejected", value: 1 },
  ],
  recentOvertimeTable: [
    {
      id: 1,
      user: "Al",
      userInitials: "AL",
      duration: "2h",
      date: "Oct 1, 2026",
      status: "approved",
    },
  ],
  recentStandbyTable: [],
  pendingLeaveItems: [],
  pendingLeaveTotal: 0,
};

describe("HRDashboardView", () => {
  it("shows a loading card instead of zeros and false empty states", () => {
    render(<HRDashboardView {...baseProps} isLoading />);

    expect(screen.getByText("Loading dashboard…")).toBeInTheDocument();
    // The false claims that used to flash before the aggregate landed.
    expect(screen.queryByText("No approved hours for this period.")).not.toBeInTheDocument();
    expect(screen.queryByText("All leave requests have been processed.")).not.toBeInTheDocument();
  });

  it("offers a retry when the aggregate fails, and never shows a false empty dashboard", () => {
    const onRetry = vi.fn();
    render(<HRDashboardView {...baseProps} isError onRetry={onRetry} />);

    expect(screen.getByText("Couldn't load the HR dashboard")).toBeInTheDocument();
    expect(screen.queryByText("No approved hours for this period.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders the org sections once data is in", () => {
    render(<HRDashboardView {...baseProps} />);

    expect(screen.getByRole("heading", { name: "Approved Hours" })).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getByText("Al")).toBeInTheDocument();
  });
});
