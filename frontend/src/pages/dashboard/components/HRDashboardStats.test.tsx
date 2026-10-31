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

  it("renders a meter only where the ratio is real", () => {
    const hrStats = {
      avg_overtime_hours: 5.5,
      active_teams_count: 3,
      pending_overtime: 2,
      pending_standby: 1,
      pending_leaves: 4,
      total_users: 10,
    };
    const { container } = render(<HRDashboardStats hrStats={hrStats} />);
    const fills = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid="stat-card-progress-fill"]')
    );
    // Only Pending Requests carries a meter: overtime's share of everything pending.
    expect(fills.length).toBe(1);
    expect(fills[0].style.width).toBe("29%");
  });

  it("renders the pending meter at zero when nothing is pending", () => {
    const { container } = render(<HRDashboardStats hrStats={{}} />);
    const fills = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid="stat-card-progress-fill"]')
    );
    expect(fills.length).toBe(1);
    expect(fills[0].style.width).toBe("0%");
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
    expect(screen.getByText("5.5h average")).toBeInTheDocument();
    expect(screen.getByText("3 teams")).toBeInTheDocument();
    expect(screen.getByText("2 overtime")).toBeInTheDocument();
    expect(screen.getByText("1 standby")).toBeInTheDocument();
    expect(screen.getByText("4 leave")).toBeInTheDocument();
    expect(screen.getByText("10 users")).toBeInTheDocument();
  });

  it("counts pending leave, so the tile equals the pipeline's pending figure", () => {
    // Same numbers the pipeline card shows as Pending (overtime + standby + leave).
    const hrStats = { pending_overtime: 8, pending_standby: 6, pending_leaves: 6 };
    render(<HRDashboardStats hrStats={hrStats} />);
    expect(getValueByTitle("Pending Requests")).toContain("20");
    expect(screen.queryByText("Total Requests")).not.toBeInTheDocument();
  });
});
