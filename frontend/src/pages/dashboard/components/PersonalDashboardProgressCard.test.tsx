import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PersonalDashboardProgressCard } from "./PersonalDashboardProgressCard";

describe("PersonalDashboardProgressCard", () => {
  it("uses a shared GlassCard surface and tabular numeric summaries", () => {
    const { container } = render(
      <PersonalDashboardProgressCard
        personalOvertimeHours={12}
        leaveProgress={20}
        personalStandbyHours={2.5}
        pendingLeaveDays={1}
      />
    );

    expect(screen.getByText("My Progress")).toBeInTheDocument();
    expect(container.querySelector(".bg-gradient-to-br")).toBeNull();
    expect(container.querySelectorAll(".tabular-nums").length).toBeGreaterThanOrEqual(2);
  });

  it("renders the leave utilization ring and three relative-magnitude tiles", () => {
    render(
      <PersonalDashboardProgressCard
        personalOvertimeHours={12}
        leaveProgress={20}
        personalStandbyHours={2.5}
        pendingLeaveDays={1}
      />
    );

    expect(screen.getByLabelText("Leave utilization 20%")).toBeInTheDocument();
    expect(screen.getByText("Leave Utilization")).toBeInTheDocument();
    expect(screen.getByText("Overtime Hours")).toBeInTheDocument();
    expect(screen.getByText("Standby Hours")).toBeInTheDocument();
    expect(screen.getByText("Pending Leave")).toBeInTheDocument();
  });

  it("renders a weekly overtime/standby bar chart from the passed logs", () => {
    const { container } = render(
      <PersonalDashboardProgressCard
        personalOvertimeHours={12}
        leaveProgress={20}
        personalStandbyHours={2.5}
        pendingLeaveDays={1}
        weekOvertimeLogs={[{ date: "2026-09-14", hours: 2 }]}
        weekStandbyLogs={[{ date: "2026-09-15", hours: 1 }]}
      />
    );

    expect(container.querySelector('[data-testid="weekly-hours-chart"]')).toBeInTheDocument();
  });

  it("shows an empty state instead of a blank chart when no hours logged this week", () => {
    const { getByText, container } = render(
      <PersonalDashboardProgressCard
        personalOvertimeHours={12}
        leaveProgress={20}
        personalStandbyHours={2.5}
        pendingLeaveDays={1}
        weekOvertimeLogs={[]}
        weekStandbyLogs={[]}
      />
    );

    expect(getByText("No overtime or standby hours logged this week.")).toBeInTheDocument();
    expect(container.querySelector('[data-testid="weekly-hours-chart"]')).toBeNull();
  });
});
