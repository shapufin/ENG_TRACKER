import type { LeaveBalance, LeaveBalanceDetail } from "@/types";
import type { VacationBalanceBreakdown, BalanceDetail } from "./vacation-types";

const toNum = (v: string | number | undefined | null): number => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const toBalanceDetailFromBalance = (balance: LeaveBalance): BalanceDetail => ({
  totalDays: toNum(balance.total_days),
  usedDays: toNum(balance.used_days),
  pendingDays: toNum(balance.pending_days),
  availableDays: toNum(balance.available_days),
  effectiveAvailableDays: toNum(balance.effective_available_days ?? balance.available_days),
  isCarryOver: Boolean(balance.is_carry_over),
  expiresAt: balance.expires_at ?? undefined,
  accrualStartDate: balance.accrual_start_date ?? undefined,
  monthlyAccruedDays: undefined,
  year: balance.year,
});

export const toBalanceDetailFromSummary = (
  detail: LeaveBalanceDetail | null,
  opts: { isCarryOver: boolean; year?: number }
): BalanceDetail | null => {
  if (!detail) return null;
  return {
    totalDays: toNum(detail.total_days),
    usedDays: toNum(detail.used_days),
    pendingDays: toNum(detail.pending_days),
    availableDays: toNum(detail.available_days),
    effectiveAvailableDays: toNum(detail.effective_available_days ?? detail.available_days),
    isCarryOver: opts.isCarryOver,
    expiresAt: detail.expires_at ?? undefined,
    isExpired: detail.is_expired,
    accrualStartDate: detail.accrual_start_date ?? undefined,
    monthlyAccruedDays: detail.monthly_accrued_days,
    year: opts.year,
  };
};

const getEffectiveAvailable = (detail?: BalanceDetail | null): number =>
  toNum(detail?.effectiveAvailableDays ?? detail?.availableDays);

const sumProp = (
  a: BalanceDetail | null | undefined,
  b: BalanceDetail | null | undefined,
  key: "usedDays" | "pendingDays" | "totalDays"
): number => toNum(a?.[key]) + toNum(b?.[key]);

const resolveYear = (
  current?: BalanceDetail | null,
  carryOver?: BalanceDetail | null
): number | undefined => current?.year ?? carryOver?.year;

const buildBreakdown = (
  current?: BalanceDetail | null,
  carryOver?: BalanceDetail | null
): VacationBalanceBreakdown | null => {
  if (!current && !carryOver) return null;

  return {
    remainingDays: getEffectiveAvailable(current) + getEffectiveAvailable(carryOver),
    usedDays: sumProp(current, carryOver, "usedDays"),
    pendingDays: sumProp(current, carryOver, "pendingDays"),
    totalDays: sumProp(current, carryOver, "totalDays"),
    year: resolveYear(current, carryOver),
    current: current ?? undefined,
    carryOver: carryOver ?? undefined,
  };
};

export const deriveVacationBalanceFromBalances = (
  balances?: LeaveBalance[] | null
): VacationBalanceBreakdown | null => {
  if (!balances || balances.length === 0) return null;
  const vacationBalances = balances.filter((balance) => balance.leave_type === "vacation");
  if (!vacationBalances.length) return null;

  const current = vacationBalances.find((balance) => !balance.is_carry_over);
  const carry = vacationBalances.find((balance) => Boolean(balance.is_carry_over));

  return buildBreakdown(
    current ? toBalanceDetailFromBalance(current) : undefined,
    carry ? toBalanceDetailFromBalance(carry) : undefined
  );
};
