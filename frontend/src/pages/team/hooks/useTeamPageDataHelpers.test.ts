import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { calcVacationDaysLeft } from "./useTeamPageDataHelpers";
import type { UserProfile } from "@/types";

const members: UserProfile[] = [
  { user: { id: 1 }, teams_detail: [{ id: 1, name: "A" }] } as unknown as UserProfile,
  { user: { id: 2 }, teams_detail: [{ id: 2, name: "B" }] } as unknown as UserProfile,
];

const balances = [
  { user: 1, leave_type: "vacation", year: 2026, available_days: "5" },
  { user: 2, leave_type: "vacation", year: 2026, available_days: 3 },
  { user: 1, leave_type: "sick", year: 2026, available_days: "10" },
];

describe("calcVacationDaysLeft", () => {
  // The function reads "today" (previous year's balance until March 31), so pin it.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 15));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 0 when no balances or members", () => {
    expect(calcVacationDaysLeft(undefined, members, "all")).toBe(0);
    expect(calcVacationDaysLeft([], [], "all")).toBe(0);
  });

  it("sums vacation days for all members", () => {
    expect(calcVacationDaysLeft(balances, members, "all")).toBe(8);
  });

  it("filters by team", () => {
    expect(calcVacationDaysLeft(balances, members, "1")).toBe(5);
    expect(calcVacationDaysLeft(balances, members, "2")).toBe(3);
  });

  it("uses the previous year's balance through March 31, then the current year's", () => {
    const yearly = [
      { user: 1, leave_type: "vacation", year: 2026, available_days: 4 },
      { user: 1, leave_type: "vacation", year: 2027, available_days: 9 },
    ];
    vi.setSystemTime(new Date(2027, 2, 31)); // last day of the carry-over window
    expect(calcVacationDaysLeft(yearly, members, "all")).toBe(4);
    vi.setSystemTime(new Date(2027, 3, 1));
    expect(calcVacationDaysLeft(yearly, members, "all")).toBe(9);
  });

  it("clamps negative days to 0", () => {
    const negativeBalances = [
      { user: 1, leave_type: "vacation", year: 2026, available_days: "-2" },
    ];
    expect(calcVacationDaysLeft(negativeBalances, members, "all")).toBe(0);
  });
});
