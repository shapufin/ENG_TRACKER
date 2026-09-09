import { describe, it, expect } from "vitest";
import { toBalanceDetailFromSummary } from "./vacation-utils";
import type { LeaveBalanceDetail } from "@/types";

const baseDetail: LeaveBalanceDetail = {
  id: 1,
  total_days: 20,
  used_days: 5,
  pending_days: 2,
  available_days: 13,
  effective_available_days: 15,
  expires_at: "2024-12-31",
  is_expired: false,
  accrual_start_date: "2024-01-01",
  monthly_accrued_days: 1.5,
} as LeaveBalanceDetail;

describe("toBalanceDetailFromSummary", () => {
  it("returns null for null detail", () => {
    expect(toBalanceDetailFromSummary(null, { isCarryOver: false })).toBeNull();
  });

  it("maps detail fields correctly", () => {
    const result = toBalanceDetailFromSummary(baseDetail, { isCarryOver: false, year: 2024 });
    expect(result).toMatchObject({
      totalDays: 20,
      usedDays: 5,
      pendingDays: 2,
      availableDays: 13,
      effectiveAvailableDays: 15,
      isCarryOver: false,
      expiresAt: "2024-12-31",
      isExpired: false,
      accrualStartDate: "2024-01-01",
      monthlyAccruedDays: 1.5,
      year: 2024,
    });
  });

  it("uses available_days when effective_available_days is missing", () => {
    const { effective_available_days: _, ...detailWithoutEffective } = baseDetail;
    const result = toBalanceDetailFromSummary(detailWithoutEffective as any, {
      isCarryOver: false,
    });
    expect(result?.effectiveAvailableDays).toBe(13);
  });

  it("marks as carryover when requested", () => {
    const result = toBalanceDetailFromSummary(baseDetail, { isCarryOver: true });
    expect(result?.isCarryOver).toBe(true);
  });
});
