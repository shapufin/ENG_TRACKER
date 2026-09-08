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
        approvedLeaveDays={3}
      />
    );

    expect(screen.getByText("Overtime Hours")).toBeInTheDocument();
    expect(container.querySelectorAll(".tabular-nums").length).toBeGreaterThanOrEqual(3);
    expect(container.querySelector(".bg-gradient-to-br")).toBeNull();
    expect(container.querySelector('[class*="bg-card/50"]')).toBeNull();
  });
});
