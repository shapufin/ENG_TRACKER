import { describe, expect, it } from "vitest";
import { fractionToPercent, parseOptionalDecimal, percentToFraction } from "./ruleSetFormUtils";

describe("rule set display conversions", () => {
  it.each([
    ["0", "0", "0"],
    ["0.095", "9.5", "0.095"],
    ["0.13", "13", "0.13"],
    ["0.23", "23", "0.23"],
    ["1", "100", "1"],
    ["1.25", "125", "1.25"],
  ])("converts %s without binary rounding", (fraction, percent, expectedFraction) => {
    expect(fractionToPercent(fraction)).toBe(percent);
    expect(percentToFraction(percent)).toBe(expectedFraction);
  });

  it("returns empty display values for blank or malformed input", () => {
    expect(fractionToPercent(null)).toBe("");
    expect(percentToFraction(" ")).toBe("");
    expect(percentToFraction("not-a-number")).toBe("");
    expect(parseOptionalDecimal("")).toBeNull();
    expect(parseOptionalDecimal("12.50")).toBe("12.50");
  });
});
