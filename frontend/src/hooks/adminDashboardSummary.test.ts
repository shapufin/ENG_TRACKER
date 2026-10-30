import { describe, expect, it } from "vitest";
import { computeAdminDashboardSummary } from "./adminDashboardSummary";

const stats = {
  total_users: 12,
  total_overtime_hours: 10.5,
  total_standby_hours: "4" as unknown as number,
  pending_overtime: 2,
  approved_overtime: 3,
  rejected_overtime: 1,
  pending_standby: 4,
  approved_standby: 5,
  rejected_standby: 2,
  pending_leaves: 6,
  approved_leaves: 7,
  rejected_leaves: 3,
  avg_overtime_hours: 2,
  active_teams_count: 4,
};

describe("computeAdminDashboardSummary", () => {
  it("aggregates dashboard counts and chart data", () => {
    expect(computeAdminDashboardSummary(stats)).toEqual({
      totalUsers: 12,
      totalTeams: 4,
      totalPending: 12,
      statusData: [
        { name: "Pending OT", value: 2 },
        { name: "Pending SB", value: 4 },
        { name: "Pending Leave", value: 6 },
        { name: "Approved", value: 15 },
        { name: "Rejected", value: 6 },
      ],
    });
  });

  it("returns safe empty values when stats are unavailable", () => {
    expect(computeAdminDashboardSummary()).toEqual({
      totalUsers: 0,
      totalTeams: 0,
      totalPending: 0,
      statusData: [
        { name: "Pending OT", value: 0 },
        { name: "Pending SB", value: 0 },
        { name: "Pending Leave", value: 0 },
        { name: "Approved", value: 0 },
        { name: "Rejected", value: 0 },
      ],
    });
  });
});
