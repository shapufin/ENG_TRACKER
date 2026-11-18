import { describe, it, expect } from "vitest";
import { buildTrendChartData } from "./ticketKPIDashboardHelpers";

describe("buildTrendChartData", () => {
  it("keeps a month without data as a gap, never as 0 hours", () => {
    const rows = buildTrendChartData([
      { month: "2026-02", total_tickets: 4, avg_resolution_hours: 5.5 },
      { month: "2026-03", total_tickets: 0, avg_resolution_hours: null },
    ]);
    expect(rows[0].avgHours).toBe(5.5);
    expect(rows[1].avgHours).toBeNull();
  });
});
