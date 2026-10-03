import { describe, expect, it } from "vitest";
import { workingDaysOpen } from "./recordKinds";

// Mirrors the backend: weekdays inclusive between the dates, minus one
// (`count_business_days(start, today) - 1` in plugins/tl_scorecard/services.py).
describe("workingDaysOpen", () => {
  const at = (iso: string) => new Date(`${iso}T12:00:00`);

  it("is zero on the day itself", () => {
    expect(workingDaysOpen("2026-10-05", at("2026-10-05"))).toBe(0);
  });

  it("does not count a weekend as time open", () => {
    // Fri 2026-10-02 -> Mon 2026-10-05: three calendar days, one working day.
    expect(workingDaysOpen("2026-10-02", at("2026-10-05"))).toBe(1);
  });

  it("reaches five a week later and passes the 5-day SLA the day after", () => {
    expect(workingDaysOpen("2026-10-05", at("2026-10-12"))).toBe(5);
    expect(workingDaysOpen("2026-10-05", at("2026-10-13"))).toBe(6);
  });

  it("never goes negative for a future date", () => {
    expect(workingDaysOpen("2026-10-09", at("2026-10-05"))).toBe(0);
  });
});
