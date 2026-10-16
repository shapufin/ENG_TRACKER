import { describe, expect, it } from "vitest";
import { normalizeCalendarGroup } from "./calendarGroup";

describe("normalizeCalendarGroup", () => {
  it("trims, lowercases and joins whitespace runs with dashes", () => {
    expect(normalizeCalendarGroup("  MSC  SIAE Pod ")).toBe("msc-siae-pod");
  });

  it("keeps existing underscore names as they are", () => {
    expect(normalizeCalendarGroup("msc_siae")).toBe("msc_siae");
  });

  it("returns an empty string for blank input", () => {
    expect(normalizeCalendarGroup("   ")).toBe("");
  });
});
