import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { AnalyticsTrendCharts } from "./AnalyticsTrendCharts";
import type { AnalyticsTrends } from "./types";

const trends: AnalyticsTrends = {
  overtime: [{ date: "2026-08-01", hours: 1 }],
  standby: [{ date: "2026-08-01", hours: 1 }],
  leave: [{ date: "2026-08-01", count: 1, approved: 1, pending: 0, rejected: 0 }],
  user_activity: [{ date: "2026-08-01", new_users: 1, new_active: 1 }],
};

describe("AnalyticsTrendCharts modernization", () => {
  it("keeps explicit chart parent heights for Recharts measurement", () => {
    const { container } = render(<AnalyticsTrendCharts trends={trends} period="month" />);

    expect(container.querySelector('[class*="h-[280px]"]')).toBeInTheDocument();
  });
});
