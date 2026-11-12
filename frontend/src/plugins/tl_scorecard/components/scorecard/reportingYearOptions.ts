import { currentBusinessYear } from "@/lib/date-format-utils";

/** Last three years, this year and next; the selected year is always present. */
export const reportingYearOptions = (selected: number, current = currentBusinessYear()): number[] => {
  const years = [current - 3, current - 2, current - 1, current, current + 1];
  return years.includes(selected) ? years : [...years, selected].sort((a, b) => a - b);
};
