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
  it("shows when the leave was requested for, so HR can act on it", () => {
    render(<HRDashboardPendingLeave items={[item]} total={1} />);
    expect(screen.getByText("02/11/2026 – 04/11/2026")).toBeInTheDocument();
  });

  it("pluralises the requested day count", () => {
    render(
      <HRDashboardPendingLeave items={[{ ...item, days_requested: 1 }, item]} total={2} />
    );
    expect(screen.getByText("1 day requested")).toBeInTheDocument();
    expect(screen.getByText("3 days requested")).toBeInTheDocument();
  });

  it("keeps the amber dot decorative: the section title and badge already say pending", () => {
    render(<HRDashboardPendingLeave items={[item]} total={1} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
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
