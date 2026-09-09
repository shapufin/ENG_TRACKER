import type { LeaveBalance } from "@/types";

/**
 * Real remaining vacation days for the request-form allowance banner.
 * DRF serializes DecimalFields as strings, so values are normalized at this
 * boundary — the banner must never disappear on a string balance.
 */
export const getRemainingDays = (balances: LeaveBalance[] | undefined): number => {
  const vacation = (balances ?? []).find((b) => b.leave_type === "vacation" && !b.is_carry_over);
  const raw = vacation?.effective_available_days ?? vacation?.available_days ?? 0;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
};
