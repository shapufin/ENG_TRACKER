import { describe, it, expect } from "vitest";
import { buildMetricBars, computeCarryOverAndBalance, formatDays } from "./calendarPageMetrics";
import type { LeaveBalance } from "@/types";

describe("formatDays", () => {
  it("formats whole numbers without decimals", () => {
    expect(formatDays(5)).toBe("5");
  });

  it("formats one decimal when present", () => {
    expect(formatDays(5.5)).toBe("5.5");
  });

  it("returns 0 for non-finite values", () => {
    expect(formatDays(NaN)).toBe("0");
    expect(formatDays(Infinity)).toBe("0");
  });
});

describe("buildMetricBars", () => {
  it("returns empty bars when summary is null", () => {
    const result = buildMetricBars(null);
    expect(result).toHaveLength(3);
    expect(result[0].progress).toBe(0);
    expect(result[1].progress).toBe(0);
    expect(result[2].progress).toBe(0);
  });

  it("computes progress bars from vacation summary", () => {
    const result = buildMetricBars({
      remainingDays: 10,
      usedDays: 5,
      pendingDays: 2,
      totalDays: 20,
      year: 2024,
    } as any);
    expect(result[0].label).toBe("Remaining");
    expect(result[0].progress).toBe(50);
    expect(result[1].progress).toBe(25);
    expect(result[2].progress).toBe(10);
  });

  it("caps progress at 100%", () => {
    const result = buildMetricBars({
      remainingDays: 30,
      usedDays: 0,
      pendingDays: 0,
      totalDays: 20,
      year: 2024,
    } as any);
    expect(result[0].progress).toBe(100);
  });

  it("returns 0 progress when totalDays is 0", () => {
    const result = buildMetricBars({
      remainingDays: 5,
      usedDays: 0,
      pendingDays: 0,
      totalDays: 0,
      year: 2024,
    } as any);
    expect(result[0].progress).toBe(0);
  });
});

describe("computeCarryOverAndBalance", () => {
  const balances: LeaveBalance[] = [
    {
      id: 1,
      user: 1,
      leave_type: "vacation",
      year: 2024,
      total_days: 20,
      used_days: 0,
      pending_days: 0,
      available_days: 20,
      is_carry_over: false,
      created_at: "",
      updated_at: "",
    },
    {
      id: 2,
      user: 1,
      leave_type: "vacation",
      year: 2024,
      total_days: 5,
      used_days: 0,
      pending_days: 0,
      available_days: 5,
      is_carry_over: true,
      created_at: "",
      updated_at: "",
    },
    {
      id: 3,
      user: 1,
      leave_type: "sick",
      year: 2024,
      total_days: 10,
      used_days: 0,
      pending_days: 0,
      available_days: 10,
      is_carry_over: false,
      created_at: "",
      updated_at: "",
    },
  ] as LeaveBalance[];

  it("finds current and carryover vacation balances", () => {
    const result = computeCarryOverAndBalance(balances);
    expect(result.currentBalance?.id).toBe(1);
    expect(result.carryOver?.id).toBe(2);
  });

  it("returns undefined for missing balances", () => {
    const result = computeCarryOverAndBalance([]);
    expect(result.currentBalance).toBeUndefined();
    expect(result.carryOver).toBeUndefined();
  });
});
