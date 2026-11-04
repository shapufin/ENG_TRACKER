import { describe, it, expect } from "vitest";
import { trendWindowStart } from "./useHRReportQueries";

describe("trendWindowStart", () => {
  it("spans six months ending at the end date's month", () => {
    expect(trendWindowStart("2026-11-30")).toBe("2026-06-01");
  });

  it("crosses a year boundary", () => {
    expect(trendWindowStart("2026-02-28")).toBe("2025-09-01");
  });

  it("leaves an unparseable end untouched", () => {
    expect(trendWindowStart("")).toBe("");
  });
});
