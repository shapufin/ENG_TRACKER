import { APP_INCEPTION_YEAR, currentBusinessYear } from "@/lib/date-format-utils";

/**
 * Up to three years back (never before the platform launch), this year and
 * next. A selected year is always present, even when it is outside that range.
 */
export const reportingYearOptions = (selected: number, current = currentBusinessYear()): number[] => {
  const start = Math.max(APP_INCEPTION_YEAR, current - 3);
  const years: number[] = [];
  for (let year = start; year <= current + 1; year += 1) years.push(year);
  return years.includes(selected) ? years : [...years, selected].sort((a, b) => a - b);
};
