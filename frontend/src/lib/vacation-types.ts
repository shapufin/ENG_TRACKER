export interface VacationBalanceBreakdown {
  remainingDays: number;
  usedDays: number;
  pendingDays: number;
  totalDays: number;
  /** Days earned so far (1.8 per month, rounded up); equals totalDays when fully accrued. */
  accruedDays?: number;
  /** Live balance of accrued days minus used and pending (can be negative if borrowing against future accrual). */
  liveAccruedBalance?: number;
  /** Total vacation days eligible for until the end of the year (pro-rated by hire date). */
  yearlyEntitlement?: number;
  year?: number;
  current?: BalanceDetail;
  carryOver?: BalanceDetail;
}

export interface BalanceDetail {
  totalDays: number;
  usedDays: number;
  pendingDays: number;
  availableDays: number;
  effectiveAvailableDays: number;
  isCarryOver: boolean;
  expiresAt?: string | null;
  isExpired?: boolean;
  accrualStartDate?: string | null;
  monthlyAccruedDays?: number;
  yearlyEntitlement?: number;
  liveAccruedBalance?: number;
  year?: number;
}
