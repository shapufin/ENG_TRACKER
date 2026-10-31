import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HRDashboardPendingLeave } from "./HRDashboardPendingLeave";

vi.mock("@/components/ui/GlassCard", () => ({
  GlassCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

const item = {
  id: 1,
  user_name: "Alice",
  status: "pending",
  days_requested: 3,
  start_date: "2026-11-02",
  end_date: "2026-11-04",
};

describe("HRDashboardPendingLeave", () => {
  it("renders an accessible label on the amber pending dot (not color-only)", () => {
    render(<HRDashboardPendingLeave items={[item]} total={1} />);
    const dot = screen.getByRole("status");
    expect(dot).toHaveAttribute("aria-label", "Pending");
  });

  it("renders no status dot when there are no pending requests", () => {
    render(<HRDashboardPendingLeave items={[]} total={0} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the org pending total in the badge, not just the page it fetched", () => {
    render(<HRDashboardPendingLeave items={[item]} total={12} />);
    expect(screen.getByText("12 Awaiting Decision")).toBeInTheDocument();
    expect(screen.getByText(/\+11 more pending requests/)).toBeInTheDocument();
  });
});
