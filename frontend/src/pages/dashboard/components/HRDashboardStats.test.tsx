import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HRDashboardStats } from "./HRDashboardStats";

const getValueByTitle = (title: string) => {
  const titleEl = screen.getByText(title);
  const card = titleEl.closest("[class*='shadow-glass']");
  return card?.textContent;
};

describe("HRDashboardStats", () => {
  it("renders stats from hrStats", () => {
    const hrStats = {
      avg_overtime_hours: 5.5,
      active_teams_count: 3,
      pending_overtime: 2,
      pending_standby: 1,
      total_users: 10,
    };
    render(<HRDashboardStats hrStats={hrStats} />);
    expect(getValueByTitle("Avg. Overtime")).toContain("5.5h");
    expect(getValueByTitle("Active Teams")).toContain("3");
    expect(getValueByTitle("Total Requests")).toContain("3");
    expect(getValueByTitle("Workforce")).toContain("10");
  });

  it("renders defaults when hrStats is empty", () => {
    render(<HRDashboardStats hrStats={{}} />);
    expect(getValueByTitle("Avg. Overtime")).toContain("0h");
    expect(getValueByTitle("Active Teams")).toContain("0");
    expect(getValueByTitle("Total Requests")).toContain("0");
    expect(getValueByTitle("Workforce")).toContain("0");
  });

  it("renders a progress bar on all four stat cards with computed widths", () => {
    const hrStats = {
      avg_overtime_hours: 5.5,
      active_teams_count: 3,
      pending_overtime: 2,
      pending_standby: 1,
      total_users: 10,
    };
    const { container } = render(<HRDashboardStats hrStats={hrStats} />);
    const fills = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid="stat-card-progress-fill"]')
    );
    expect(fills.length).toBe(4);
    // Card order: Avg. Overtime, Active Teams, Total Requests, Workforce.
    // Avg. Overtime: min(100, round(5.5 / 4 * 100)) = 100
    expect(fills[0].style.width).toBe("100%");
    // Active Teams: static status bar.
    expect(fills[1].style.width).toBe("100%");
    // Total Requests: pending_overtime share = round(2 / 3 * 100) = 67.
    expect(fills[2].style.width).toBe("67%");
    // Workforce: static status bar.
    expect(fills[3].style.width).toBe("100%");
  });

  it("renders default bar widths when hrStats is empty", () => {
    const { container } = render(<HRDashboardStats hrStats={{}} />);
    const fills = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid="stat-card-progress-fill"]')
    );
    expect(fills.length).toBe(4);
    expect(fills[0].style.width).toBe("0%");
    expect(fills[1].style.width).toBe("0%");
    expect(fills[2].style.width).toBe("0%");
    expect(fills[3].style.width).toBe("0%");
  });
});
