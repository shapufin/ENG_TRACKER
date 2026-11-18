import { describe, it, expect } from "vitest";
import { rankBreakdown } from "./rankBreakdown";

describe("rankBreakdown", () => {
  it("sorts by count, keeps the top rows and folds the rest into Other", () => {
    const rows = rankBreakdown({ a: 5, b: 9, c: 1, d: 3, e: 2 }, 2);
    expect(rows.map((r) => [r.label, r.count])).toEqual([
      ["b", 9],
      ["a", 5],
      ["Other", 6],
    ]);
  });

  it("gives each row its share of the total and keeps shares adding to 100", () => {
    const rows = rankBreakdown({ a: 1, b: 1, c: 1 }, 8);
    expect(rows.reduce((sum, r) => sum + r.percent, 0)).toBe(100);
  });

  it("does not add an Other row when everything fits", () => {
    expect(rankBreakdown({ a: 2, b: 1 }, 8).map((r) => r.label)).toEqual(["a", "b"]);
  });

  it("returns nothing for an empty or zero breakdown", () => {
    expect(rankBreakdown({}, 8)).toEqual([]);
    expect(rankBreakdown({ a: 0 }, 8)).toEqual([]);
  });
});
