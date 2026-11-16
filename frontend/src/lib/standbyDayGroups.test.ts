import { describe, expect, it } from "vitest";
import {
  selectedRecordIds,
  formatStandbyHours,
  collapseSameDayStandbyLogs,
  computeDayGroups,
  formatSegmentRange,
} from "./standbyDayGroups";
import type { StandbyLog } from "@/types";

const log = (
  id: number,
  user: number,
  date: string,
  hours: number,
  status: StandbyLog["status"] = "approved"
): StandbyLog =>
  ({
    id,
    user,
    date,
    hours,
    status,
    description: "",
    evidence: "",
    rejection_reason: "",
    created_at: "",
    updated_at: "",
  }) as StandbyLog;

describe("collapseSameDayStandbyLogs", () => {
  it("returns single-shift days as individual rows without segments", () => {
    const list = [log(1, 1, "2026-11-23", 6), log(2, 1, "2026-11-24", 6)];
    const collapsed = collapseSameDayStandbyLogs(list);
    expect(collapsed).toHaveLength(2);
    expect(collapsed[0].hours).toBe(6);
    expect(collapsed[0].segments).toBeUndefined();
  });

  it("collapses multi-shift days into 1 row summing hours and listing segments", () => {
    const list = [
      { ...log(1, 1, "2026-11-24", 9), start_time: "00:00:00", end_time: "09:00:00" },
      { ...log(2, 1, "2026-11-24", 6), start_time: "18:00:00", end_time: "00:00:00" },
      log(3, 1, "2026-11-25", 6),
    ];
    const collapsed = collapseSameDayStandbyLogs(list);
    expect(collapsed).toHaveLength(2);
    expect(collapsed[0].id).toBe(1);
    expect(collapsed[0].date).toBe("2026-11-24");
    expect(collapsed[0].hours).toBe(15);
    expect(collapsed[0].segments).toHaveLength(2);
    expect(collapsed[0].segment_ids).toEqual([1, 2]);
    expect(collapsed[0].segments?.[0]).toEqual({
      id: 1,
      start_time: "00:00:00",
      end_time: "09:00:00",
      hours: 9,
      status: "approved",
      rejection_reason: "",
      is_carried_over: undefined,
    });
    expect(collapsed[0].segments?.[1]).toEqual({
      id: 2,
      start_time: "18:00:00",
      end_time: "00:00:00",
      hours: 6,
      status: "approved",
      rejection_reason: "",
      is_carried_over: undefined,
    });
    expect(collapsed[1].id).toBe(3);
    expect(collapsed[1].hours).toBe(6);
  });

  it("never merges different users on the same date", () => {
    const list = [log(1, 1, "2026-11-24", 9), log(2, 2, "2026-11-24", 6)];
    const collapsed = collapseSameDayStandbyLogs(list);
    expect(collapsed).toHaveLength(2);
    expect(collapsed[0].user).toBe(1);
    expect(collapsed[1].user).toBe(2);
  });

  it("resolves status: pending if any is pending", () => {
    const list = [log(1, 1, "2026-11-24", 9, "approved"), log(2, 1, "2026-11-24", 6, "pending")];
    const collapsed = collapseSameDayStandbyLogs(list);
    expect(collapsed[0].status).toBe("pending");
  });
});

describe("computeDayGroups", () => {
  it("leaves single-row days out of the result", () => {
    expect(computeDayGroups([log(1, 1, "2026-11-23", 6), log(2, 1, "2026-11-24", 6)]).size).toBe(0);
  });

  it("groups adjacent rows of one person and date, total on the last row", () => {
    const groups = computeDayGroups([
      log(1, 1, "2026-11-24", 9),
      log(2, 1, "2026-11-24", 6),
      log(3, 1, "2026-11-25", 6),
    ]);
    expect(groups.get(1)).toEqual({ continues: false, isLast: false, count: 2, total: 15 });
    expect(groups.get(2)).toEqual({ continues: true, isLast: true, count: 2, total: 15 });
    expect(groups.has(3)).toBe(false);
  });

  it("never merges two people on the same date", () => {
    expect(computeDayGroups([log(1, 1, "2026-11-24", 9), log(2, 2, "2026-11-24", 6)]).size).toBe(0);
  });

  it("reads decimal-string hours from the API", () => {
    const groups = computeDayGroups([
      log(1, 1, "2026-11-24", "9.00" as unknown as number),
      log(2, 1, "2026-11-24", "6.00" as unknown as number),
    ]);
    expect(groups.get(2)?.total).toBe(15);
  });
});

describe("formatSegmentRange", () => {
  it("trims seconds and needs both times", () => {
    expect(formatSegmentRange({ start_time: "18:00:00", end_time: "00:00:00" })).toBe(
      "18:00–00:00"
    );
    expect(formatSegmentRange({ start_time: null, end_time: null })).toBeNull();
  });
});

describe("formatStandbyHours", () => {
  it("drops the API's trailing zeros", () => {
    expect(formatStandbyHours("6.00")).toBe("6");
    expect(formatStandbyHours(1.5)).toBe("1.5");
  });
});

describe("selectedRecordIds", () => {
  const rows = [{ id: 10, segment_ids: [10, 11] }, { id: 20 }, { id: 30 }];

  it("reads selection keys as record ids, not positions", () => {
    expect(selectedRecordIds(rows, { "20": true })).toEqual([20]);
  });

  it("expands a bundled day to every shift", () => {
    expect(selectedRecordIds(rows, { "10": true, "30": true })).toEqual([10, 11, 30]);
  });

  it("ignores unselected keys and unknown ids", () => {
    expect(selectedRecordIds(rows, { "20": false, "99": true })).toEqual([]);
  });
});
