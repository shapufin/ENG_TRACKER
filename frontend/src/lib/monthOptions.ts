export type MonthFormat = "yyyy-mm-dd" | "yyyy-mm";

/**
 * Generate a list of month option strings ending at the current month.
 *
 * @param count - Number of months to generate (default 12).
 * @param includeEmpty - Prepend an empty string for "no selection" states.
 * @param format - "yyyy-mm-dd" (first of month) or "yyyy-mm".
 * @returns Array of month strings, most recent first.
 */
export const generateMonthOptions = (
  count = 12,
  includeEmpty = false,
  format: MonthFormat = "yyyy-mm-dd"
): string[] => {
  const opts: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const base = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    opts.push(format === "yyyy-mm-dd" ? `${base}-01` : base);
  }
  return includeEmpty ? ["", ...opts] : opts;
};

/**
 * Format a "YYYY-MM" or "YYYY-MM-DD" string as a human-readable month label
 * (e.g. "January 2026").
 */
export const formatMonthLabel = (value: string): string => {
  const [year, month] = value.split("-");
  if (year && month) {
    const d = new Date(Number(year), Number(month) - 1, 1);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
    }
  }
  const fallback = new Date(value);
  return fallback.toLocaleDateString(undefined, { year: "numeric", month: "long" });
};
