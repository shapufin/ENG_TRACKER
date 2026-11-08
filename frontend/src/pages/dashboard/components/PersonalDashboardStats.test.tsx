import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PersonalDashboardStats } from "./PersonalDashboardStats";

describe("PersonalDashboardStats", () => {
  it("uses shared StatCard surfaces and tabular numeric values", () => {
    const { container } = render(
      <PersonalDashboardStats
        user={{ username: "alice" } as never}
        personalOvertimeHours={4.5}
        personalStandbyHours={2}
        vacationBalanceDays={3}
      />
    );

    expect(screen.getByText("Overtime Hours")).toBeInTheDocument();
    expect(container.querySelectorAll(".tabular-nums").length).toBeGreaterThanOrEqual(3);
    expect(container.querySelector(".bg-linear-to-br")).toBeNull();
    expect(container.querySelector('[class*="bg-card/50"]')).toBeNull();
  });

  it("truncates a long username instead of overflowing the System Status card", () => {
    render(
      <PersonalDashboardStats
        user={{ username: "e2e_employee_a_with_a_very_long_name" } as never}
        personalOvertimeHours={0}
        personalStandbyHours={0}
        vacationBalanceDays={0}
      />
    );

    const name = screen.getByText("e2e_employee_a_with_a_very_long_name");
    expect(name).toHaveClass("truncate");
    expect(name).toHaveAttribute("title", "e2e_employee_a_with_a_very_long_name");
  });

  it("renders footer strips with real tracked values", () => {
    const { container } = render(
      <PersonalDashboardStats
        user={{ username: "alice" } as never}
        personalOvertimeHours={4.5}
        personalStandbyHours={2}
        vacationBalanceDays={3}
      />
    );

    const footers = container.querySelectorAll('[data-testid="stat-card-footer"]');
    expect(footers).toHaveLength(3);
    expect(screen.getByText("4.5h tracked")).toBeInTheDocument();
    expect(screen.getByText("2h tracked")).toBeInTheDocument();
    expect(screen.getByText("3d left")).toBeInTheDocument();
  });
});
