import { describe, expect, it } from "vitest";
import { buildDayConflicts, conflictEntriesForMonth } from "./calendarCoverage";

const user = (id: number, name = `User ${id}`) => ({ id, full_name: name }) as never;
const group = (ids: number[]) => ({ workspaceId: 1, workspaceName: "Alpha", users: ids.map((i) => user(i)) });
const leave = (
  userId: number,
  start: string,
  end: string,
  over: Record<string, unknown> = {}
) => ({
  user: userId,
  user_name: `User ${userId}`,
  start_date: start,
  end_date: end,
  status: "approved",
  request_type: "vacation",
  ...over,
});

describe("buildDayConflicts", () => {
  it("flags a day when coverage drops to 50% or below", () => {
    const map = buildDayConflicts({
      leaves: [leave(1, "2026-11-04", "2026-11-04"), leave(2, "2026-11-04", "2026-11-04")] as never,
      groups: [group([1, 2, 3, 4])],
    });
    const day = map.get("2026-11-04");
    expect(day).toMatchObject({ away: 2, total: 4, coveragePct: 50 });
    expect(day?.users.map((u) => u.id)).toEqual([1, 2]);
  });

  it("does not flag a day above 50% coverage", () => {
    const map = buildDayConflicts({
      leaves: [leave(1, "2026-11-04", "2026-11-04")] as never,
      groups: [group([1, 2, 3, 4])],
    });
    expect(map.size).toBe(0);
  });

  it("counts only approved vacation or sick leave", () => {
    const map = buildDayConflicts({
      leaves: [
        leave(1, "2026-11-04", "2026-11-04", { status: "pending" }),
        leave(2, "2026-11-04", "2026-11-04", { status: "rejected" }),
        leave(3, "2026-11-04", "2026-11-04", { request_type: "unpaid" }),
      ] as never,
      groups: [group([1, 2, 3, 4])],
    });
    expect(map.size).toBe(0);
  });

  it("skips weekends and public holidays inside a span", () => {
    const map = buildDayConflicts({
      leaves: [leave(1, "2026-11-06", "2026-11-10"), leave(2, "2026-11-06", "2026-11-10")] as never,
      groups: [group([1, 2, 3, 4])],
      holidayDates: new Set(["2026-11-09"]),
    });
    // Fri 6 and Tue 10 count; Sat 7, Sun 8 and the holiday Mon 9 do not.
    expect([...map.keys()].sort()).toEqual(["2026-11-06", "2026-11-10"]);
  });

  it("ignores one-person teams, which would always read 0%", () => {
    const map = buildDayConflicts({
      leaves: [leave(1, "2026-11-04", "2026-11-04")] as never,
      groups: [group([1])],
    });
    expect(map.size).toBe(0);
  });

  it("measures each workspace on its own and reports the worst one", () => {
    const map = buildDayConflicts({
      leaves: [leave(1, "2026-11-04", "2026-11-04"), leave(5, "2026-11-04", "2026-11-04")] as never,
      groups: [group([1, 2, 3, 4]), { workspaceId: 2, workspaceName: "Beta", users: [user(5), user(6)] }],
    });
    // Alpha is 75% (fine), Beta is 50% (conflict).
    expect(map.get("2026-11-04")).toMatchObject({ away: 1, total: 2, coveragePct: 50 });
  });

  it("counts a member once even when listed in two workspaces", () => {
    const map = buildDayConflicts({
      leaves: [leave(1, "2026-11-04", "2026-11-04")] as never,
      groups: [group([1, 2]), group([1, 2])],
    });
    expect(map.get("2026-11-04")?.users).toHaveLength(1);
  });
});

describe("conflictEntriesForMonth", () => {
  it("lists only the visible month, in date order, with a coverage description", () => {
    const map = buildDayConflicts({
      leaves: [
        leave(1, "2026-12-01", "2026-12-01"),
        leave(2, "2026-12-01", "2026-12-01"),
        leave(1, "2026-11-12", "2026-11-12"),
        leave(2, "2026-11-12", "2026-11-12"),
        leave(1, "2026-11-05", "2026-11-05"),
        leave(2, "2026-11-05", "2026-11-05"),
      ] as never,
      groups: [group([1, 2])],
    });
    const entries = conflictEntriesForMonth(map, new Date(2026, 10, 15));
    expect(entries.map((e) => e.dateKey)).toEqual(["2026-11-05", "2026-11-12"]);
    expect(entries[0].description).toBe("2/2 on leave (0% coverage)");
    expect(entries[0].users.map((u) => u.name)).toEqual(["User 1", "User 2"]);
  });
});
