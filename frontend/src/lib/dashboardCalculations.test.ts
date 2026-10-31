import { describe, it, expect } from "vitest";
import {
  buildRecentActivity,
  sumOvertimeHours,
  sumStandbyHours,
  sumApprovedLeaveDays,
  sumPendingLeaveDays,
} from "./dashboardCalculations";

describe("dashboardCalculations", () => {
  it("builds recent activity sorted by timestamp", () => {
    const overtime = [
      {
        id: 1,
        user_name: "Alice",
        hours: 2,
        created_at: "2024-06-01T10:00:00Z",
        status: "pending",
      },
    ] as any;
    const standby = [
      { id: 2, user_name: "Bob", hours: 3, created_at: "2024-06-02T10:00:00Z", status: "approved" },
    ] as any;
    const leave = [
      {
        id: 3,
        user_name: "Carol",
        days_requested: 1,
        created_at: "2024-06-03T10:00:00Z",
        status: "approved",
      },
    ] as any;
    const result = buildRecentActivity(overtime, standby, leave);
    expect(result[0].id).toBe("leave-3");
    expect(result.length).toBe(3);
  });

  it("sums hours and days", () => {
    const overtime = [{ hours: 2 }, { hours: 3 }] as any[];
    const standby = [{ hours: 1.5 }] as any[];
    const leave = [
      { days_requested: 2, status: "approved" },
      { days_requested: 1, status: "pending" },
    ] as any[];
    expect(sumOvertimeHours(overtime)).toBe(5);
    expect(sumStandbyHours(standby)).toBe(1.5);
    expect(sumApprovedLeaveDays(leave)).toBe(2);
    expect(sumPendingLeaveDays(leave)).toBe(1);
  });

});
