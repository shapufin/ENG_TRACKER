import { describe, expect, it } from "vitest";
import { collapseSameDayOvertimeLogs, buildMonthlyOvertimeSections } from "./overtimeDayGroups";
import { selectedRecordIds } from "./standbyDayGroups";
import type { OvertimeLog } from "@/types";

const ot = (
  id: number,
  user: number,
  date: string,
  hours: number | string,
  status: OvertimeLog["status"] = "approved",
  extra: Partial<OvertimeLog> = {}
): OvertimeLog =>
  ({
    id,
    user,
    client: 1,
    date,
    hours: hours as number,
    status,
    description: "",
    evidence: "",
    rejection_reason: "",
    created_at: "",
    updated_at: "",
    ...extra,
  }) as OvertimeLog;

describe("collapseSameDayOvertimeLogs", () => {
  it("leaves single-block days untouched without blocks array", () => {
    const res = collapseSameDayOvertimeLogs([ot(1, 1, "2026-11-23", 1), ot(2, 1, "2026-11-24", 2)]);
    expect(res).toHaveLength(2);
    expect(res[0].blocks).toBeUndefined();
    expect(res[0].segment_ids).toBeUndefined();
  });

  it("never merges rows across different payroll periods on the same date", () => {
    const res = collapseSameDayOvertimeLogs([
      ot(1, 1, "2026-11-24", 1, "approved", { requested_processing_period: "2026-11-01" }),
      ot(2, 1, "2026-11-24", 2, "approved", { requested_processing_period: "2026-12-01" }),
    ]);
    expect(res).toHaveLength(2);
  });

  it("never merges different users on the same date", () => {
    const res = collapseSameDayOvertimeLogs([ot(1, 1, "2026-11-24", 1), ot(2, 2, "2026-11-24", 2)]);
    expect(res).toHaveLength(2);
  });

  it("groups out-of-order same-day blocks, sums decimal strings and 0h covered entries", () => {
    const res = collapseSameDayOvertimeLogs([
      ot(10, 1, "2026-11-24", "1.50", "approved", { start_time: "19:15:00" }),
      ot(20, 2, "2026-11-24", 2, "pending"),
      ot(30, 1, "2026-11-24", 0, "pending", { start_time: "18:10:00" }),
      ot(40, 1, "2026-11-24", "0.50", "approved", { start_time: "20:00:00" }),
    ]);
    expect(res).toHaveLength(2);
    const u1 = res.find((r) => r.user === 1)!;
    expect(u1.hours).toBe(2);
    expect(u1.status).toBe("pending");
    expect(u1.blocks?.map((b) => b.id)).toEqual([30, 10, 40]);
    expect(u1.segment_ids).toEqual([30, 10, 40]);
    expect(selectedRecordIds(res, { [u1.id]: true })).toEqual([30, 10, 40]);
  });

  it("resolves mixed approved+rejected to approved and excludes rejected hours", () => {
    const res = collapseSameDayOvertimeLogs([
      ot(1, 1, "2026-11-24", 2, "approved", { start_time: "18:00:00" }),
      ot(2, 1, "2026-11-24", 3, "rejected", { start_time: "20:00:00" }),
    ]);
    expect(res).toHaveLength(1);
    expect(res[0].status).toBe("approved");
    expect(res[0].hours).toBe(2);
    const sections = buildMonthlyOvertimeSections(res);
    expect(sections[0].totalHours).toBe(2);
  });
});

describe("buildMonthlyOvertimeSections", () => {
  it("buckets by period month newest first with block and pending counts", () => {
    const grouped = collapseSameDayOvertimeLogs([
      ot(1, 1, "2026-10-15", 2, "approved"),
      ot(2, 1, "2026-11-24", 1, "pending", { start_time: "18:00:00" }),
      ot(3, 1, "2026-11-24", 1, "approved", { start_time: "19:00:00" }),
    ]);
    const sections = buildMonthlyOvertimeSections(grouped);
    expect(sections.map((s) => s.monthKey)).toEqual(["2026-11", "2026-10"]);
    expect(sections[0].monthLabel).toBe("November 2026");
    expect(sections[0].totalBlocks).toBe(2);
    expect(sections[0].totalHours).toBe(2);
    expect(sections[0].pendingCount).toBe(1);
  });
});
