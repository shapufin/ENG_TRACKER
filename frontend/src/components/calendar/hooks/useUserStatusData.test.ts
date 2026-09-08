import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useUserStatusData } from "./useUserStatusData";
import type { LeaveBalance, PublicHoliday } from "@/types";

const baseBalance: LeaveBalance = {
  id: 1,
  user: 1,
  user_name: "Alice",
  leave_type: "vacation",
  year: 2024,
  total_days: 20,
  used_days: 5,
  pending_days: 2,
  available_days: 13,
  effective_available_days: 13,
  is_carry_over: false,
  expires_at: null,
  accrual_start_date: null,
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
};

const carryOverBalance: LeaveBalance = {
  ...baseBalance,
  id: 2,
  is_carry_over: true,
  total_days: 5,
  used_days: 0,
  pending_days: 0,
  available_days: 5,
  effective_available_days: 5,
};

const render = (balances: LeaveBalance[] = [], holidays: PublicHoliday[] = []) =>
  renderHook(() => useUserStatusData(balances, holidays)).result.current;

describe("useUserStatusData", () => {
  it("returns defaults when no balances are provided", () => {
    const result = render();
    expect(result.hasBalanceData).toBe(false);
    expect(result.remainingDays).toBe(0);
    expect(result.usedDays).toBe(0);
    expect(result.pendingDays).toBe(0);
    expect(result.totalDays).toBe(0);
    expect(result.vacationYear).toBe(new Date().getFullYear());
    expect(result.carryOverDetail).toBeUndefined();
    expect(result.currentDetail).toBeUndefined();
    expect(result.upcomingHolidays).toEqual([]);
  });

  it("computes status from a single current balance", () => {
    const result = render([baseBalance]);
    expect(result.hasBalanceData).toBe(true);
    expect(result.remainingDays).toBe(13);
    expect(result.usedDays).toBe(5);
    expect(result.pendingDays).toBe(2);
    expect(result.totalDays).toBe(20);
    expect(result.vacationYear).toBe(2024);
  });

  it("combines current and carryover balances", () => {
    const result = render([baseBalance, carryOverBalance]);
    expect(result.remainingDays).toBe(18);
    expect(result.usedDays).toBe(5);
    expect(result.totalDays).toBe(25);
    expect(result.carryOverDetail).toBeDefined();
    expect(result.currentDetail).toBeDefined();
  });

  it("still reports balance data when only non-vacation leave types exist", () => {
    const sickBalance = { ...baseBalance, leave_type: "sick" as const, id: 3 };
    const result = render([sickBalance]);
    expect(result.hasBalanceData).toBe(true);
    expect(result.remainingDays).toBe(0);
  });

  it("returns upcoming holidays sorted and capped at 3", () => {
    const holidays: PublicHoliday[] = [
      { id: 1, name: "Past", date: "2020-01-01", is_global: true },
      { id: 2, name: "Future A", date: "2030-01-01", is_global: true },
      { id: 3, name: "Future B", date: "2030-02-01", is_global: true },
      { id: 4, name: "Future C", date: "2030-03-01", is_global: true },
      { id: 5, name: "Future D", date: "2030-04-01", is_global: true },
    ];
    const result = render([], holidays);
    expect(result.upcomingHolidays).toHaveLength(3);
    expect(result.upcomingHolidays.map((h) => h.name)).toEqual([
      "Future A",
      "Future B",
      "Future C",
    ]);
  });

  it("computes progress percentages", () => {
    const result = render([baseBalance]);
    expect(result.remainingProgress).toBe(65);
    expect(result.usedProgress).toBe(25);
    expect(result.pendingProgress).toBe(10);
  });

  it("handles zero total days gracefully", () => {
    const emptyBalance = {
      ...baseBalance,
      total_days: 0,
      used_days: 0,
      pending_days: 0,
      available_days: 0,
      effective_available_days: 0,
    };
    const result = render([emptyBalance]);
    expect(result.totalDays).toBe(0);
    expect(result.remainingProgress).toBe(0);
  });
});
