import { describe, expect, it } from "vitest";
import { buildLeaveRangeClusters, buildMonthlyLeaveSections } from "./leaveRangeGroups";
import type { LeaveRequest } from "@/types";

const leave = (
  id: number,
  user: number,
  start_date: string,
  end_date: string,
  days_requested: number,
  status: LeaveRequest["status"] = "approved",
  team_name = "Core"
): LeaveRequest =>
  ({
    id,
    user,
    user_full_name: `User ${user}`,
    team_name,
    request_type: "vacation",
    start_date,
    end_date,
    days_requested,
    reason: "",
    status,
    approved_by: null,
    approved_at: null,
    rejection_reason: "",
    created_at: "",
    updated_at: "",
  }) as LeaveRequest;

describe("buildLeaveRangeClusters", () => {
  it("preserves server days_requested including 0.5 half days", () => {
    const res = buildLeaveRangeClusters([leave(1, 1, "2026-11-10", "2026-11-10", 0.5)]);
    expect(res[0].days_requested).toBe(0.5);
    expect(res[0].cluster_id).toBeUndefined();
  });

  it("bridges gaps of 2 calendar days or less but keeps a 3-day gap separate", () => {
    const res = buildLeaveRangeClusters([
      leave(1, 1, "2026-11-11", "2026-11-13", 3),
      leave(2, 2, "2026-11-15", "2026-11-17", 2),
      leave(3, 3, "2026-11-20", "2026-11-21", 2),
    ]);
    expect(res[0].cluster_id).toBeDefined();
    expect(res[1].cluster_id).toBe(res[0].cluster_id);
    expect(res[0].is_cluster_head).toBe(true);
    expect(res[1].is_cluster_head).toBe(false);
    expect(res[2].cluster_id).toBeUndefined();
  });

  it("excludes rejected requests from overlaps and requires >= 2 for same-team peak", () => {
    const res = buildLeaveRangeClusters([
      leave(1, 1, "2026-11-10", "2026-11-12", 3, "approved", "Core"),
      leave(2, 2, "2026-11-11", "2026-11-13", 3, "rejected", "Core"),
      leave(3, 3, "2026-11-11", "2026-11-12", 2, "pending", "Platform"),
    ]);
    expect(res[0].cluster_size).toBe(2);
    expect(res[1].cluster_id).toBeUndefined();
    expect(res[0].team_peaks).toEqual([]);
  });

  it("computes same-team peak when 2+ teammates overlap", () => {
    const res = buildLeaveRangeClusters([
      leave(1, 1, "2026-11-10", "2026-11-12", 3, "approved", "Core"),
      leave(2, 2, "2026-11-11", "2026-11-14", 4, "pending", "Core"),
    ]);
    expect(res[0].team_peaks).toEqual([
      { team: "Core", peakDate: "2026-11-11", count: 2, employeeNames: ["User 1", "User 2"] },
    ]);
  });
});

describe("buildMonthlyLeaveSections", () => {
  it("lists cross-month requests in every spanned month with clipped days and excludes rejected", () => {
    const sections = buildMonthlyLeaveSections([
      // Oct 29 (Thu), Oct 30 (Fri) = 2 weekdays in Oct; Nov 2 (Mon), Nov 3 (Tue) = 2 weekdays in Nov
      leave(1, 1, "2026-10-29", "2026-11-03", 4, "pending"),
      leave(2, 2, "2026-11-10", "2026-11-11", 2, "rejected"),
    ]);
    expect(sections.map((s) => s.monthKey)).toEqual(["2026-11", "2026-10"]);
    expect(sections[0].totalDays).toBe(2);
    expect(sections[0].pendingCount).toBe(1);
    expect(sections[1].totalDays).toBe(2);
    expect(sections[1].rows[0].continues_next_month).toBe(true);
  });
});
