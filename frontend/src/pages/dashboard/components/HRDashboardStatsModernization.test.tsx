import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { HRDashboardStats } from "./HRDashboardStats";

describe("HRDashboardStats modernization", () => {
  it("uses shared StatCard surfaces with tabular numeric values", () => {
    const { container } = render(
      <HRDashboardStats
        hrStats={{
          avg_overtime_hours: 5.5,
          active_teams_count: 3,
          pending_overtime: 2,
          pending_standby: 1,
          total_users: 10,
        }}
      />
    );

    expect(container.querySelector(".bg-gradient-to-br")).toBeNull();
    expect(container.querySelectorAll(".tabular-nums").length).toBeGreaterThanOrEqual(4);
  });
});
