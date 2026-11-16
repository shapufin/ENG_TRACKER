import { describe, expect, it } from "vitest";
import { computeDayGroups, formatSegmentRange } from "./standbyDayGroups";

const log = (id: number, user: number, date: string, hours: number) => ({
  id,
  user,
  date,
  hours,
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
