export const computeProgress = (value: number, total: number) =>
  total > 0 ? Math.min(100, (value / total) * 100) : 0;

/**
 * Compact day count for dense UI: whole days render without decimals
 * ("8 d"), fractional days keep at most one decimal ("8.5 d").
 */
export const formatCompactDays = (value: number): string => {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 10) / 10);
};

export const computeCarryOverProgress = (
  carryOverDetail?: { totalDays: number; effectiveAvailableDays?: number } | null
) => {
  if (!carryOverDetail || carryOverDetail.totalDays <= 0) return 0;
  return Math.min(
    100,
    ((carryOverDetail.effectiveAvailableDays ?? 0) / carryOverDetail.totalDays) * 100
  );
};
