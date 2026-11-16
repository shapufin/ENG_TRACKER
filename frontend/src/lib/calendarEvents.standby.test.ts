import { describe, expect, it } from "vitest";
import { buildCalendarEvents } from "./calendarEvents";
import type { StandbyLog } from "@/types";

const log = (id: number, date: string, start: string, end: string, hours: string, user = 1) =>
  ({
    id,
    user,
    user_name: "Eva",
    date,
    start_time: start,
    end_time: end,
    hours,
    status: "approved",
    description: "",
  }) as unknown as StandbyLog;

const filters = {
  showStandby: true,
  showVacation: false,
  showSick: false,
  showFilters: false,
  visibleUsers: new Set<number>(),
};

describe("buildCalendarEvents standby bundling", () => {
  it("shows one event per person and day with the total and the shifts", () => {
    const events = buildCalendarEvents(
      [
        log(1, "2026-11-17", "18:00:00", "00:00:00", "6.00"),
        log(2, "2026-11-17", "00:00:00", "09:00:00", "9.00"),
        log(3, "2026-11-18", "18:00:00", "00:00:00", "6.00"),
        log(4, "2026-11-17", "18:00:00", "00:00:00", "6.00", 2),
      ],
      [],
      [],
      [],
      filters,
      true
    );
    expect(events).toHaveLength(3);
    const day = events.find((e) => e.start === "2026-11-17" && e.userId === 1);
    expect(day?.title).toBe("SB: 15h");
    expect(day?.description).toContain("00:00–09:00, 18:00–00:00");
    expect(day?.segmentIds).toEqual([2, 1]);
  });
});
