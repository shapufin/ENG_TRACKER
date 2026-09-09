import { describe, it, expect } from "vitest";
import { calculateHours, validateTimeRange } from "./time-utils";

describe("calculateHours", () => {
  it("returns null for empty inputs", () => {
    expect(calculateHours("", "17:00")).toBeNull();
    expect(calculateHours("09:00", "")).toBeNull();
  });

  it("calculates same-day hours", () => {
    expect(calculateHours("09:00", "17:00")).toBe(8);
  });

  it("calculates overnight hours", () => {
    expect(calculateHours("18:00", "09:00")).toBe(15);
  });

  it("rounds up partial hours", () => {
    expect(calculateHours("09:00", "10:01")).toBe(2);
  });
});

describe("validateTimeRange", () => {
  it("returns null when either time is empty", () => {
    expect(validateTimeRange("", "17:00")).toBeNull();
    expect(validateTimeRange("09:00", "")).toBeNull();
    expect(validateTimeRange("", "")).toBeNull();
  });

  it("returns null for valid same-day range", () => {
    expect(validateTimeRange("09:00", "17:00")).toBeNull();
  });

  it("returns null for valid overnight range", () => {
    expect(validateTimeRange("18:00", "09:00")).toBeNull();
  });

  it("returns null for exactly 24 hours (same time overnight)", () => {
    expect(validateTimeRange("09:00", "09:00")).toBeNull();
  });

  it("returns null for 1-hour range", () => {
    expect(validateTimeRange("09:00", "10:00")).toBeNull();
  });

  it("returns null for max valid same-day range (23:59)", () => {
    expect(validateTimeRange("00:00", "23:59")).toBeNull();
  });

  // Note: with valid HH:MM inputs (00:00–23:59), the >24h error case is
  // unreachable — the max non-overnight diff is 1439 mins < 1440, and
  // overnight adjustment caps at exactly 1440. The error check is
  // defensive against invalid time strings (e.g. "34:00") that bypass
  // the HTML <input type="time"> constraint. Tested here for completeness.
  it("returns error for invalid time exceeding 24h diff", () => {
    expect(validateTimeRange("00:00", "34:00")).toBe(
      "End time must be within 24 hours of start time"
    );
  });
});
