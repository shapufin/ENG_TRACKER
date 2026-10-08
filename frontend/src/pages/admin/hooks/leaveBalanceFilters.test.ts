import { describe, it, expect } from "vitest";
import type { LeaveBalance } from "@/types";
import { isExpiringSoon } from "./leaveBalanceFilters";

const today = new Date("2026-10-08T12:00:00Z");
const bal = (over: Partial<LeaveBalance>): LeaveBalance =>
  ({
    id: 1,
    is_carry_over: true,
    expires_at: "2026-11-01",
    available_days: 3,
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
