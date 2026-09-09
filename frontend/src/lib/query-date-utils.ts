import type { CustomDateRange } from "@/pages/hours_logs/components/useHoursLogPageState";
import { toLocalISODate } from "@/lib/date-format-utils";

export const buildCurrentMonthDateParams = (customDateRange?: CustomDateRange | null) => {
  if (customDateRange && customDateRange.from && customDateRange.to) {
    return { date_from: customDateRange.from, date_to: customDateRange.to };
  }
  return {
    date_from: toLocalISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
    date_to: toLocalISODate(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)),
  };
};
