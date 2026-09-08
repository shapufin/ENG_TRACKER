import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HRDashboardPendingLeave } from "./HRDashboardPendingLeave";

vi.mock("@/components/ui/GlassCard", () => ({
  GlassCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

describe("HRDashboardPendingLeave", () => {
  it("renders an accessible label on the amber pending dot (not color-only)", () => {
    render(
      <HRDashboardPendingLeave
        leaveData={{
          results: [{ id: 1, user: 1, user_name: "Alice", status: "pending", days_requested: 3 }],
        }}
      />
    );
    const dot = screen.getByRole("status");
    expect(dot).toHaveAttribute("aria-label", "Pending");
  });

  it("renders no status dot when there are no pending requests", () => {
    render(<HRDashboardPendingLeave leaveData={{ results: [] }} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
