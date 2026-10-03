import { describe, expect, it } from "vitest";
import { recordStripStats } from "./recordStripStats";
import { RECORD_CONFIGS } from "./recordKinds";

const byKey = (key: string) => RECORD_CONFIGS.find((c) => c.key === key)!;

describe("recordStripStats", () => {
  it("counts totals from the visible rows only", () => {
    const config = byKey("idle");
    const rows = [
      { id: 1, status: "open" },
      { id: 2, status: "resolved" },
      { id: 3, status: "resolved" },
    ] as never[];
    expect(recordStripStats(config, rows)).toEqual({
      total: 3,
      attention: 1,
      done: 2,
      donePct: 67,
    });
  });

  it("derives attention from warning/danger tones and done from success", () => {
    const config = byKey("pips");
    const rows = [
      { id: 1, status: "draft" }, // warning
      { id: 2, status: "active" }, // info -> neither
      { id: 3, status: "completed" }, // success
      { id: 4, status: "cancelled" }, // neutral -> neither
    ] as never[];
    expect(recordStripStats(config, rows)).toEqual({
      total: 4,
      attention: 1,
      done: 1,
      donePct: 25,
    });
  });

  it("reports zeros, never NaN, for an empty month", () => {
    expect(recordStripStats(byKey("meetings"), [])).toEqual({
      total: 0,
      attention: 0,
      done: 0,
      donePct: 0,
    });
  });
});
