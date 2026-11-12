import { describe, expect, it } from "vitest";
import { reportingYearOptions } from "./reportingYearOptions";

describe("reportingYearOptions", () => {
  it("keeps last year reachable after the New Year rollover", () => {
    expect(reportingYearOptions(2027, 2027)).toContain(2026);
  });

  it("always includes a year chosen from the URL, in order", () => {
    expect(reportingYearOptions(2018, 2027)).toEqual([2018, 2024, 2025, 2026, 2027, 2028]);
  });
});
