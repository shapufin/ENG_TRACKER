import { describe, it, expect } from "vitest";
import { dropRepeatedBreakdowns, rankBreakdown } from "./rankBreakdown";

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

describe("dropRepeatedBreakdowns", () => {
  const all = {
    assignee: { "Jane Doe": 4 },
    requester: { Alfa: 3, Beta: 1 },
    "Analyst": { "jane doe": 4 },
    "Requester Org.": { alfa: 3, beta: 1 },
    CE: { Commvault: 3, Veeam: 1 },
    "Driver Group": { Red: 3, Blue: 1 },
    Validator: { red: 3, blue: 1 },
    Origination: { BMS: 3, Email: 1 },
  };

  it("drops a field whose values and counts repeat a standard field or an earlier one", () => {
    const kept = Object.keys(
      dropRepeatedBreakdowns(all, ["assignee", "requester"])
    );
    expect(kept).toEqual(["CE", "Driver Group", "Origination"]);
  });

  it("keeps two fields that merely share a count shape", () => {
    const kept = dropRepeatedBreakdowns({ a: { x: 3, y: 1 }, b: { p: 3, q: 1 } }, []);
    expect(Object.keys(kept)).toEqual(["a", "b"]);
  });
});
