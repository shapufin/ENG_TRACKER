import { describe, it, expect } from "vitest";
import { getRemainingDays } from "./leaveBalanceUtils";
import type { LeaveBalance } from "@/types";

const row = (overrides: Partial<LeaveBalance> = {}): LeaveBalance =>
  ({
    id: 1,
    user: 7,
    leave_type: "vacation",
    year: 2026,
    total_days: 22,
    used_days: 3,
    pending_days: 0,
    available_days: 14,
    is_carry_over: false,
    ...overrides,
  }) as LeaveBalance;

describe("getRemainingDays", () => {
  it("returns the numeric balance", () => {
    expect(getRemainingDays([row({ available_days: 16 })])).toBe(16);
  });

  it("coerces DRF decimal strings so the banner never disappears", () => {
    // Runtime delivers strings despite the number-typed contract (DRF Decimals).
    expect(getRemainingDays([row({ available_days: "14.00" as unknown as number })])).toBe(14);
  });

  it("prefers effective_available_days", () => {
    expect(
      getRemainingDays([
        row({ available_days: 5, effective_available_days: "12.5" as unknown as number }),
      ])
    ).toBe(12.5);
  });

  it("ignores carry-over rows", () => {
    expect(
      getRemainingDays([
        row({ id: 2, is_carry_over: true, available_days: 99 }),
        row({ id: 1, available_days: 7 }),
      ])
    ).toBe(7);
  });

  it("returns 0 for missing or unusable data", () => {
    expect(getRemainingDays(undefined)).toBe(0);
    expect(getRemainingDays([])).toBe(0);
    expect(getRemainingDays([row({ available_days: "n/a" as unknown as number })])).toBe(0);
  });
});
