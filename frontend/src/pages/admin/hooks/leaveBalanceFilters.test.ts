import { describe, it, expect } from "vitest";
import type { LeaveBalance } from "@/types";
import { computeBalanceTotals, filterBalances, isExpiringSoon } from "./leaveBalanceFilters";

const today = new Date("2026-10-08T12:00:00Z");
const bal = (over: Partial<LeaveBalance>): LeaveBalance =>
  ({
    id: 1,
    is_carry_over: true,
    expires_at: "2026-11-01",
    available_days: 3,
    total_days: 0,
    used_days: 0,
    pending_days: 0,
    ...over,
  }) as LeaveBalance;

describe("isExpiringSoon", () => {
  it("includes a carry-over expiring inside the window", () => {
    expect(isExpiringSoon(bal({}), today)).toBe(true);
  });

  it("window is inclusive at 60 days and excludes 61", () => {
    expect(isExpiringSoon(bal({ expires_at: "2026-12-07" }), today)).toBe(true);
    expect(isExpiringSoon(bal({ expires_at: "2026-12-08" }), today)).toBe(false);
  });

  it("includes today and excludes yesterday", () => {
    expect(isExpiringSoon(bal({ expires_at: "2026-10-08" }), today)).toBe(true);
    expect(isExpiringSoon(bal({ expires_at: "2026-10-07" }), today)).toBe(false);
  });

  it("excludes rows without an expiry, non carry-over, or nothing left", () => {
    expect(isExpiringSoon(bal({ expires_at: null }), today)).toBe(false);
    expect(isExpiringSoon(bal({ expires_at: "" }), today)).toBe(false);
    expect(isExpiringSoon(bal({ is_carry_over: false }), today)).toBe(false);
    expect(isExpiringSoon(bal({ available_days: 0 }), today)).toBe(false);
  });
});

describe("computeBalanceTotals", () => {
  const rows = [
    bal({
      id: 1,
      total_days: 20,
      used_days: 5,
      pending_days: 2,
      available_days: 13,
      is_carry_over: false,
    }),
    bal({
      id: 2,
      total_days: 10,
      used_days: 5,
      pending_days: 0,
      available_days: 5,
      is_carry_over: false,
    }),
    bal({ id: 3, total_days: 4, used_days: 0, pending_days: 1, available_days: 3 }),
  ];

  it("sums the rows and counts only expiring carry-over as at risk", () => {
    expect(computeBalanceTotals(rows, today)).toEqual({
      allocated: 34,
      used: 10,
      pending: 3,
      atRisk: 3,
      usedPct: 29,
    });
  });

  it("returns zeros and a null percentage for empty input or zero allocation", () => {
    const empty = { allocated: 0, used: 0, pending: 0, atRisk: 0, usedPct: null };
    expect(computeBalanceTotals([], today)).toEqual(empty);
    expect(
      computeBalanceTotals([bal({ total_days: 0, used_days: 0, available_days: 0 })], today)
    ).toEqual(empty);
  });
});

describe("filterBalances", () => {
  const rows = [
    bal({ id: 1, year: 2025, leave_type: "vacation", is_carry_over: false }),
    bal({ id: 2, year: 2026, leave_type: "sick" }),
    bal({ id: 3, year: 2026, leave_type: "vacation", expires_at: "2027-12-01" }),
    bal({ id: 4, year: 2026, leave_type: "vacation" }),
  ];
  const ids = (r: LeaveBalance[]) => r.map((b) => b.id);

  it("returns everything when no filter is set", () => {
    expect(ids(filterBalances(rows, { expiringOnly: false }, today))).toEqual([1, 2, 3, 4]);
  });

  it("filters by year and by type", () => {
    expect(ids(filterBalances(rows, { year: 2026, expiringOnly: false }, today))).toEqual([
      2, 3, 4,
    ]);
    expect(ids(filterBalances(rows, { type: "sick", expiringOnly: false }, today))).toEqual([2]);
  });

  it("combines with the expiring filter", () => {
    expect(
      ids(filterBalances(rows, { year: 2026, type: "vacation", expiringOnly: true }, today))
    ).toEqual([4]);
  });
});
