import { describe, expect, it } from "vitest";
import { reportingYearOptions } from "./reportingYearOptions";

describe("reportingYearOptions", () => {
  it("keeps last year reachable after the New Year rollover", () => {
    expect(reportingYearOptions(2027, 2027)).toContain(2026);
  });

  it("always includes a year chosen from the URL, in order", () => {
    expect(reportingYearOptions(2018, 2027)).toEqual([2018, 2026, 2027, 2028]);
  });

  it("never offers a year before the platform launch (2026)", () => {
    expect(reportingYearOptions(2026, 2026)).toEqual([2026, 2027]);
    expect(reportingYearOptions(2026, 2026)).not.toEqual(expect.arrayContaining([2023, 2024, 2025]));
  });

  it("keeps the three-year window once the platform is older than three years", () => {
    expect(reportingYearOptions(2029, 2029)).toEqual([2026, 2027, 2028, 2029, 2030]);
  });
});
