import { describe, it, expect } from "vitest";
import { buildTrendData } from "./trendData";

describe("buildTrendData", () => {
  it("returns nothing before the report loads", () => {
    expect(buildTrendData(undefined)).toEqual([]);
  });

  it("merges overtime and standby hours by month from the backend's time_unit key", () => {
    const report = {
      group_by: "month",
      users: [],
      overtime: [
        { time_unit: "2026-09-01", total_hours: 10, entries: 2 },
        { time_unit: "2026-10-01", total_hours: 4, entries: 1 },
      ],
      standby: [{ time_unit: "2026-10-01", total_hours: 8, entries: 1 }],
    };
    expect(buildTrendData(report)).toEqual([
      { month: "2026-09", overtime: 10 },
      { month: "2026-10", overtime: 4, standby: 8 },
    ]);
  });
});
