import { describe, expect, it } from "vitest";
import { nextMeetingSlot } from "./hbprMeta";

const NOV_12 = new Date("2026-11-12T10:00:00Z");

describe("nextMeetingSlot", () => {
  it("calls a pending slot in the current month this month's meeting, not done yet", () => {
    expect(nextMeetingSlot("2026-11-26", "on_track", NOV_12)).toEqual({
      label: "This month's meeting",
      chip: "Not done yet",
      tone: "info",
    });
  });

  it("keeps the due and overdue states visible", () => {
    expect(nextMeetingSlot("2026-11-12", "due", NOV_12)?.chip).toBe("Not done · due");
    expect(nextMeetingSlot("2026-11-05", "overdue", NOV_12)).toMatchObject({
      chip: "Overdue",
      tone: "destructive",
    });
  });

  it("labels a later month's slot as the next meeting, scheduled", () => {
    expect(nextMeetingSlot("2026-12-03", "on_track", NOV_12)).toMatchObject({
      label: "Next meeting",
      chip: "Scheduled",
    });
  });

  it("returns nothing when there is no open slot", () => {
    expect(nextMeetingSlot(null, "on_track", NOV_12)).toBeNull();
    expect(nextMeetingSlot("2026-11-26", "ended", NOV_12)).toBeNull();
  });
});
