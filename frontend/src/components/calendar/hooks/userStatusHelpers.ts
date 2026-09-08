export const computeProgress = (value: number, total: number) =>
  total > 0 ? Math.min(100, (value / total) * 100) : 0;

export const computeCarryOverProgress = (
  carryOverDetail?: { totalDays: number; effectiveAvailableDays?: number } | null
) => {
  if (!carryOverDetail || carryOverDetail.totalDays <= 0) return 0;
  return Math.min(
    100,
    ((carryOverDetail.effectiveAvailableDays ?? 0) / carryOverDetail.totalDays) * 100
  );
};
