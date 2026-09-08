import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LeaveStatsCards } from "./LeaveStatsCards";
import type { LeaveBalance } from "@/types";

vi.mock("@/components/ui/AnimatedNumber", () => ({
  AnimatedNumber: ({ value, suffix }: any) => (
    <span>
      {value}
      {suffix}
    </span>
  ),
}));

describe("LeaveStatsCards", () => {
  it("renders counts and balances", () => {
    const balances: LeaveBalance[] = [
      { leave_type: "vacation", used_days: 5, effective_available_days: 10, is_carry_over: false },
      { leave_type: "vacation", used_days: 3, effective_available_days: 0, is_carry_over: true },
    ] as LeaveBalance[];
    render(
      <LeaveStatsCards pendingCount={2} approvedCount={4} balances={balances} isLoading={false} />
    );
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("10d")).toBeInTheDocument();
    expect(screen.getByText("8d")).toBeInTheDocument();
  });

  it("renders loading state", () => {
    render(
      <LeaveStatsCards pendingCount={0} approvedCount={0} balances={undefined} isLoading={true} />
    );
    expect(screen.getAllByText("...").length).toBeGreaterThanOrEqual(4);
  });

  it("renders stat values with tabular-nums", () => {
    const { container } = render(
      <LeaveStatsCards pendingCount={2} approvedCount={4} balances={[]} isLoading={false} />
    );

    expect(container.querySelectorAll(".tabular-nums").length).toBeGreaterThanOrEqual(4);
  });

  it("renders no progress bars for the Employee-flavored card (default)", () => {
    const { container } = render(
      <LeaveStatsCards pendingCount={2} approvedCount={6} balances={[]} isLoading={false} />
    );
    expect(container.querySelectorAll('[data-testid="stat-card-progress-fill"]')).toHaveLength(0);
  });

  it("renders TL-flavored progress bars with mockup-matching ratios when isTeamLeader", () => {
    const balances: LeaveBalance[] = [
      {
        leave_type: "vacation",
        used_days: 5,
        total_days: 22,
        effective_available_days: 16,
        is_carry_over: false,
      },
    ] as LeaveBalance[];
    const { container } = render(
      <LeaveStatsCards
        isTeamLeader
        pendingCount={2}
        approvedCount={6}
        balances={balances}
        isLoading={false}
      />
    );

    const fills = container.querySelectorAll('[data-testid="stat-card-progress-fill"]');
    expect(fills).toHaveLength(4);
    expect((fills[0] as HTMLElement).style.width).toBe("25%"); // pending / (pending + approved)
    expect((fills[1] as HTMLElement).style.width).toBe("75%"); // approved / (pending + approved)
    expect((fills[2] as HTMLElement).style.width).toBe("73%"); // available / total_days
    expect((fills[3] as HTMLElement).style.width).toBe("23%"); // used / total_days
  });
});
