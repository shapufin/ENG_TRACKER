export interface VacationBalanceBreakdown {
  remainingDays: number;
  usedDays: number;
  pendingDays: number;
  totalDays: number;
  /** Days earned so far (1.8 per month, rounded up); equals totalDays when fully accrued. */
  accruedDays?: number;
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
  year?: number;
}
