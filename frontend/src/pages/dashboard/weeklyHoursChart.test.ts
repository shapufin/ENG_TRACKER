import { describe, it, expect } from "vitest";
import { buildWeeklyHoursChartData } from "./weeklyHoursChart";

describe("buildWeeklyHoursChartData", () => {
  // Saturday 2026-09-19 -> rolling window is Sun 2026-09-13 .. Sat 2026-09-19
  const now = new Date("2026-09-19T12:00:00");

  it("returns the last 7 days ending today, zeroed by default", () => {
    const points = buildWeeklyHoursChartData([], [], now);
    expect(points.map((p) => p.day)).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    expect(points.every((p) => p.overtime === 0 && p.standby === 0)).toBe(true);
  });

  it("buckets logs into the matching weekday within the rolling window", () => {
    const points = buildWeeklyHoursChartData(
      [{ date: "2026-09-14", hours: 2 }, { date: "2026-09-16", hours: 1.5 }],
      [{ date: "2026-09-19", hours: 4 }],
      now
    );
    expect(points[1]).toEqual({ day: "Mon", overtime: 2, standby: 0 });
    expect(points[3]).toEqual({ day: "Wed", overtime: 1.5, standby: 0 });
    expect(points[6]).toEqual({ day: "Sat", overtime: 0, standby: 4 });
  });

  it("includes logs from just before the calendar-week boundary", () => {
    const points = buildWeeklyHoursChartData(
      [],
      [{ date: "2026-09-12", hours: 15 }, { date: "2026-09-13", hours: 24 }],
      now
    );
    expect(points[0]).toEqual({ day: "Sun", overtime: 0, standby: 24 });
    expect(points.every((p) => p.standby !== 15)).toBe(true);
  });

  it("excludes logs older than 7 days", () => {
    const points = buildWeeklyHoursChartData(
      [{ date: "2026-09-07", hours: 3 }, { date: "2026-09-21", hours: 5 }],
      [],
      now
    );
    expect(points.every((p) => p.overtime === 0)).toBe(true);
  });

  it("sums multiple same-day entries", () => {
    const points = buildWeeklyHoursChartData(
      [{ date: "2026-09-14", hours: 2 }, { date: "2026-09-14", hours: 3 }],
      [],
      now
    );
    expect(points[1].overtime).toBe(5);
  });

  it("coerces Decimal-string standby hours instead of concatenating them", () => {
    // Standby serializer emits DecimalField strings; 0 + "2.00" must be 2,
    // not "02.00" (which also breaks the chart's has-data check downstream).
    const points = buildWeeklyHoursChartData(
      [],
      [
        { date: "2026-09-14", hours: "2.00" as unknown as number },
        { date: "2026-09-14", hours: "3.50" as unknown as number },
      ],
      now
    );
    expect(points[1].standby).toBe(5.5);
  });
});
