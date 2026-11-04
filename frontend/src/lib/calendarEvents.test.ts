import { describe, it, expect } from "vitest";
import { buildCalendarEvents } from "./calendarEvents";
import type { LeaveRequest } from "@/types";

const filters = {
  showStandby: true,
  showVacation: true,
  showSick: true,
  showFilters: false,
  visibleUsers: new Set<number>(),
};

const leave = (extra: Partial<LeaveRequest>): LeaveRequest =>
  ({
    id: 1,
    user: 7,
    user_name: "ana",
    request_type: "vacation",
    start_date: "2026-03-09",
    end_date: "2026-03-09",
    days_requested: 1,
    reason: "",
    status: "approved",
    ...extra,
  }) as LeaveRequest;

const build = (req: LeaveRequest) => buildCalendarEvents([], [req], [], [], filters, true)[0];

describe("buildCalendarEvents half days", () => {
  it("labels a morning half day with its period", () => {
    const event = build(
      leave({ days_requested: 0.5, is_half_day: true, half_day_period: "morning" })
    );

    expect(event.title).toBe("Vac: ½d (AM)");
    expect(event.compactLabel).toBe("Vacation (½ day AM)");
    expect(event.isHalfDay).toBe(true);
    expect(event.halfDayPeriod).toBe("morning");
  });

  it("labels an afternoon half day", () => {
    const event = build(
      leave({ days_requested: 0.5, is_half_day: true, half_day_period: "afternoon" })
    );

    expect(event.title).toBe("Vac: ½d (PM)");
    expect(event.halfDayPeriod).toBe("afternoon");
  });

  it("keeps the day count for a full-day request", () => {
    const event = build(leave({ days_requested: 3, end_date: "2026-03-11" }));

    expect(event.title).toBe("Vac: 3d");
    expect(event.isHalfDay).toBe(false);
  });
});
