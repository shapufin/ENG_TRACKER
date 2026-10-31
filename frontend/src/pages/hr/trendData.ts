import type { DetailedReport } from "@/services/reportService";

interface TrendPoint {
  month: string;
  overtime?: number;
  standby?: number;
}

/** Merge the month-grouped overtime and standby hours into one point per month. */
export const buildTrendData = (report?: DetailedReport): TrendPoint[] => {
  const byMonth = new Map<string, TrendPoint>();
  const add = (rows: DetailedReport["overtime"], key: "overtime" | "standby") => {
    for (const row of rows ?? []) {
      const month = row.time_unit.slice(0, 7);
      byMonth.set(month, { ...byMonth.get(month), month, [key]: row.total_hours || 0 });
    }
  };
  add(report?.overtime, "overtime");
  add(report?.standby, "standby");
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
};
