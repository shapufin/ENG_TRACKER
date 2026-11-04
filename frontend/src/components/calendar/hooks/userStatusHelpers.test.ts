import { describe, expect, it } from "vitest";
import { formatLeaveRange, groupLeaveHistory } from "./userStatusHelpers";
import type { CalendarEvent } from "../types";

const leave = (overrides: Partial<CalendarEvent>): CalendarEvent => ({
  id: "vac-1",
  title: "Vac: 1d",
  start: "2026-11-10",
  end: "2026-11-10",
  type: "vacation",
  status: "approved",
  compactLabel: "Vacation (1d)",
  days: 1,
  ...overrides,
});

describe("groupLeaveHistory", () => {
  it("drops standby shifts and holidays — they are not leave", () => {
    const rows = groupLeaveHistory([
      leave({ id: "sb-1", type: "standby", start: "2026-11-09", end: "2026-11-09" }),
      leave({ id: "holiday-1", type: "holiday", start: "2026-11-10", end: "2026-11-10" }),
      leave({ id: "vac-1" }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("vacation");
  });

  it("collapses adjacent requests of the same type and status into one run", () => {
    const rows = groupLeaveHistory([
      leave({ id: "vac-1", start: "2026-11-10", end: "2026-11-10", days: 1 }),
      leave({ id: "vac-2", start: "2026-11-11", end: "2026-11-11", days: 1 }),
      leave({ id: "vac-3", start: "2026-11-12", end: "2026-11-12", days: 1 }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      start: "2026-11-10",
      end: "2026-11-12",
      days: 3,
      requests: 3,
    });
  });

  it("keeps a gap of two or more days as separate runs", () => {
    const rows = groupLeaveHistory([
      leave({ id: "vac-1", start: "2026-11-10", end: "2026-11-11", days: 2 }),
      leave({ id: "vac-2", start: "2026-11-13", end: "2026-11-13", days: 1 }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0].start).toBe("2026-11-13");
  });

  it("never merges across type or status", () => {
    const rows = groupLeaveHistory([
      leave({ id: "vac-1", start: "2026-11-10", end: "2026-11-10" }),
      leave({ id: "sick-1", type: "sick", start: "2026-11-11", end: "2026-11-11" }),
      leave({ id: "vac-2", start: "2026-11-12", end: "2026-11-12", status: "pending" }),
      leave({ id: "vac-3", start: "2026-11-13", end: "2026-11-13" }),
    ]);

    expect(rows.map((row) => `${row.type}:${row.status}`)).toEqual([
      "vacation:approved",
      "vacation:pending",
      "sick:approved",
      "vacation:approved",
    ]);
  });

  it("orders newest first and de-duplicates repeated reasons", () => {
    const rows = groupLeaveHistory([
      leave({
        id: "vac-1",
        start: "2026-10-01",
        end: "2026-10-02",
        days: 2,
        description: "Family trip",
      }),
      leave({
        id: "vac-2",
        start: "2026-10-03",
        end: "2026-10-03",
        days: 1,
        description: "Family trip",
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].notes).toEqual(["Family trip"]);
    expect(rows[0].days).toBe(3);
  });

  it("ignores events with an unparseable date", () => {
    expect(groupLeaveHistory([leave({ start: "not-a-date" })])).toEqual([]);
  });
});

describe("formatLeaveRange", () => {
  it("formats a single day with its year", () => {
    expect(formatLeaveRange("2026-11-10", "2026-11-10")).toBe("Nov 10, 2026");
  });

  it("shares the month when the range stays inside one", () => {
    expect(formatLeaveRange("2026-11-10", "2026-11-12")).toBe("Nov 10 – 12, 2026");
  });

  it("repeats the month across a month boundary", () => {
    expect(formatLeaveRange("2026-11-28", "2026-12-02")).toBe("Nov 28 – Dec 2, 2026");
  });

  it("repeats the year across a year boundary", () => {
    expect(formatLeaveRange("2026-12-30", "2027-01-02")).toBe("Dec 30, 2026 – Jan 2, 2027");
  });
});
