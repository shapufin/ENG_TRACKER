import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PersonalDashboardView } from "./PersonalDashboardView";

vi.mock("@/components/dashboard/ActivityTimeline", () => ({ ActivityTimeline: () => null }));
vi.mock("./components/DashboardQuickActions", () => ({ DashboardQuickActions: () => null }));
vi.mock("./components/PersonalDashboardStats", () => ({ PersonalDashboardStats: () => null }));
vi.mock("./components/PersonalDashboardProgressCard", () => ({
  PersonalDashboardProgressCard: () => null,
}));
vi.mock("./components/PersonalDashboardLeavesCard", () => ({
  PersonalDashboardLeavesCard: () => <div>leaves</div>,
}));
vi.mock("./components/PersonalDashboardPendingCard", () => ({
  PersonalDashboardPendingCard: () => <div>pending</div>,
}));

describe("PersonalDashboardView", () => {
  it("puts pending items above upcoming time off on phones", () => {
    render(
      <PersonalDashboardView
        user={null}
        overtimeData={null}
        standbyData={null}
        leaveData={null}
        personalOvertimeHours={0}
        personalStandbyHours={0}
        vacationBalanceDays={0}
        pendingLeaveDays={0}
        leaveProgress={0}
        upcomingLeaves={[]}
        personalPendingItems={[]}
        personalTimelineItems={[]}
      />
    );

    expect(screen.getByText("pending").parentElement).toHaveClass("max-lg:order-first");
    expect(screen.getByText("leaves").parentElement).not.toHaveClass("max-lg:order-first");
  });
});
