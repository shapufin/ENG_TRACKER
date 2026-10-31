import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HRDashboardStats } from "./HRDashboardStats";

const getValueByTitle = (title: string) => {
  const titleEl = screen.getByText(title);
  const card = titleEl.closest("[class*='shadow-card']");
  return card?.textContent;
};

describe("HRDashboardStats", () => {
  it("renders stats from hrStats", () => {
    const hrStats = {
      avg_overtime_hours: 5.5,
      active_teams_count: 3,
      pending_overtime: 2,
      pending_standby: 1,
      pending_leaves: 4,
      total_users: 10,
    };
    render(<HRDashboardStats hrStats={hrStats} />);
    expect(getValueByTitle("Avg. Overtime")).toContain("5.5h");
    expect(getValueByTitle("Active Teams")).toContain("3");
    expect(getValueByTitle("Pending Requests")).toContain("7");
    expect(getValueByTitle("Workforce")).toContain("10");
  });

  it("renders defaults when hrStats is empty", () => {
    render(<HRDashboardStats hrStats={{}} />);
    expect(getValueByTitle("Avg. Overtime")).toContain("0h");
    expect(getValueByTitle("Active Teams")).toContain("0");
    expect(getValueByTitle("Pending Requests")).toContain("0");
    expect(getValueByTitle("Workforce")).toContain("0");
  });

  it("renders no meter: the overtime share of pending requests is not a goal", () => {
    const { container } = render(
      <HRDashboardStats hrStats={{ pending_overtime: 2, pending_standby: 1, pending_leaves: 4 }} />
    );
    expect(container.querySelectorAll('[data-testid="stat-card-progress-fill"]').length).toBe(0);
  });

  it("renders footer strips with real hrStats values", () => {
    const hrStats = {
      avg_overtime_hours: 5.5,
      active_teams_count: 3,
      pending_overtime: 2,
      pending_standby: 1,
      pending_leaves: 4,
      total_users: 10,
    };
    const { container } = render(<HRDashboardStats hrStats={hrStats} />);
    const footers = container.querySelectorAll('[data-testid="stat-card-footer"]');
    expect(footers.length).toBe(4);
    // The headline already shows the number; the footer only adds context.
    expect(screen.queryByText("5.5h average")).not.toBeInTheDocument();
    expect(screen.getByText("This month")).toBeInTheDocument();
    expect(screen.getByText("2 overtime")).toBeInTheDocument();
    expect(screen.getByText("1 standby")).toBeInTheDocument();
    expect(screen.getByText("4 leave")).toBeInTheDocument();
    expect(screen.getByText("Active headcount")).toBeInTheDocument();
  });

  it("counts pending leave, so the tile equals the pipeline's pending figure", () => {
    // Same numbers the pipeline card shows as Pending (overtime + standby + leave).
    const hrStats = { pending_overtime: 8, pending_standby: 6, pending_leaves: 6 };
    render(<HRDashboardStats hrStats={hrStats} />);
    expect(getValueByTitle("Pending Requests")).toContain("20");
    expect(screen.queryByText("Total Requests")).not.toBeInTheDocument();
  });
});
