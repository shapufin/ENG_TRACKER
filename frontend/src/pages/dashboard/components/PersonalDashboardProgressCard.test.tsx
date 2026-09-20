import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PersonalDashboardProgressCard } from "./PersonalDashboardProgressCard";

const baseProps = {
  personalOvertimeHours: 12,
  leaveProgress: 20,
  personalStandbyHours: 2.5,
  pendingLeaveDays: 1,
};

const renderCard = (props = {}) =>
  render(
    <MemoryRouter>
      <PersonalDashboardProgressCard {...baseProps} {...props} />
    </MemoryRouter>
  );

describe("PersonalDashboardProgressCard", () => {
  it("uses a shared GlassCard surface and tabular numeric summaries", () => {
    const { container } = renderCard();

    expect(screen.getByText("My Progress & Weekly Allocation Overview")).toBeInTheDocument();
    expect(container.querySelector(".bg-gradient-to-br")).toBeNull();
    expect(container.querySelectorAll(".tabular-nums").length).toBeGreaterThanOrEqual(2);
    // Regression: inner tiles/well must sit on the card surface, not a grey
    // wash (bg-muted/30, bg-background/60) that reads as a bug on white cards.
    expect(container.innerHTML).not.toContain("bg-muted/30");
    expect(container.innerHTML).not.toContain("bg-background");
  });

  it("renders the leave utilization ring and three relative-magnitude tiles", () => {
    renderCard();

    expect(screen.getByLabelText("Leave utilization 20%")).toBeInTheDocument();
    expect(screen.getByText("Leave Utilization")).toBeInTheDocument();
    expect(screen.getByText("Target: 100%")).toBeInTheDocument();
    expect(screen.getByText("Overtime Hours")).toBeInTheDocument();
    expect(screen.getByText("Standby Hours")).toBeInTheDocument();
    expect(screen.getByText("Pending Leave")).toBeInTheDocument();
  });

  it("shows a pending-approval badge when leave awaits review, else On track", () => {
    const { rerender } = renderCard({ pendingLeaveDays: 2 });
    expect(screen.getByText("2d pending approval")).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <PersonalDashboardProgressCard {...baseProps} pendingLeaveDays={0} />
      </MemoryRouter>
    );
    expect(screen.getByText("On track")).toBeInTheDocument();
    expect(screen.getByText("No pending requests")).toBeInTheDocument();
  });

  it("renders a This Week / Last Week selector wired to the parent handler", () => {
    const onWeekOffsetChange = vi.fn();
    renderCard({ weekOffset: 0, onWeekOffsetChange });

    const thisWeek = screen.getByRole("button", { name: "This Week" });
    const lastWeek = screen.getByRole("button", { name: "Last Week" });
    expect(thisWeek).toHaveAttribute("aria-pressed", "true");
    expect(lastWeek).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(lastWeek);
    expect(onWeekOffsetChange).toHaveBeenCalledWith(1);
  });

  it("hides the period selector when the parent does not wire it", () => {
    renderCard();
    expect(screen.queryByRole("button", { name: "This Week" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Last Week" })).toBeNull();
  });

  it("shows real days-utilized figures, or an honest empty state without allowance", () => {
    const { rerender } = renderCard({ leaveUsedDays: 11, leaveAvailableDays: 9 });
    expect(screen.getByText("Days Utilized")).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("/ 20 Days")).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <PersonalDashboardProgressCard {...baseProps} />
      </MemoryRouter>
    );
    expect(screen.getByText("No leave allowance set")).toBeInTheDocument();
  });

  it("captions tiles with real this-week sums from the windowed logs", () => {
    renderCard({
      weekOvertimeLogs: [
        { date: "2026-09-14", hours: 2 },
        { date: "2026-09-15", hours: 1 },
      ],
      weekStandbyLogs: [{ date: "2026-09-15", hours: 4 }],
      weekOffset: 1,
      onWeekOffsetChange: () => {},
    });

    expect(screen.getByText("3h last week")).toBeInTheDocument();
    expect(screen.getByText("4h last week")).toBeInTheDocument();
  });

  it("links Log Hours to the overtime page and scopes empty text to the period", () => {
    renderCard({
      weekOvertimeLogs: [],
      weekStandbyLogs: [],
      weekOffset: 1,
      onWeekOffsetChange: () => {},
    });

    expect(screen.getByRole("link", { name: "Log Hours" })).toHaveAttribute(
      "href",
      "/overtime"
    );
    expect(
      screen.getByText("No overtime or standby hours logged last week.")
    ).toBeInTheDocument();
  });

  it("renders a weekly overtime/standby bar chart from the passed logs", () => {
    const { container } = renderCard({
      weekOvertimeLogs: [{ date: "2026-09-14", hours: 2 }],
      weekStandbyLogs: [{ date: "2026-09-15", hours: 1 }],
    });

    expect(container.querySelector('[data-testid="weekly-hours-chart"]')).toBeInTheDocument();
  });

  it("shows an empty state instead of a blank chart when no hours logged this week", () => {
    const { getByText, container } = renderCard({
      weekOvertimeLogs: [],
      weekStandbyLogs: [],
    });

    expect(getByText("No overtime or standby hours logged this week.")).toBeInTheDocument();
    expect(container.querySelector('[data-testid="weekly-hours-chart"]')).toBeNull();
  });
});
