import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AnalyticsTrendCharts } from "./AnalyticsTrendCharts";
import type { AnalyticsTrends } from "./types";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 300, height: 300 }}>{children}</div>
    ),
  };
});

const trends: AnalyticsTrends = {
  overtime: [
    { date: "2026-08-01", hours: 10 },
    { date: "2026-08-02", hours: 20 },
  ],
  standby: [
    { date: "2026-08-01", hours: 5 },
    { date: "2026-08-02", hours: 8 },
  ],
  leave: [
    { date: "2026-08-01", count: 3, approved: 2, pending: 1, rejected: 0 },
    { date: "2026-08-02", count: 1, approved: 0, pending: 1, rejected: 0 },
  ],
  user_activity: [{ date: "2026-08-01", new_users: 2, new_active: 2 }],
};

describe("AnalyticsTrendCharts", () => {
  it("renders all chart titles with data", () => {
    const { container } = render(<AnalyticsTrendCharts trends={trends} period="month" />);
    expect(screen.getByText("Hours Trends")).toBeInTheDocument();
    expect(screen.getByText("Leave Requests")).toBeInTheDocument();
    expect(screen.getByText("User Growth")).toBeInTheDocument();
    expect(container.querySelectorAll('[class~="h-[280px]"]')).toHaveLength(3);
  });

  it("renders empty states when no data", () => {
    render(
      <AnalyticsTrendCharts
        trends={{ overtime: [], standby: [], leave: [], user_activity: [] }}
        period="month"
      />
    );
    expect(screen.getByText("No overtime or standby data for this period")).toBeInTheDocument();
    expect(screen.getByText("No leave data for this period")).toBeInTheDocument();
    expect(screen.getByText("No new users in this period")).toBeInTheDocument();
  });

  it("renders empty states when trends is undefined", () => {
    render(<AnalyticsTrendCharts trends={undefined} period="year" />);
    expect(screen.getByText("No overtime or standby data for this period")).toBeInTheDocument();
  });

  it("shows leave view toggle and switches to trend view", () => {
    render(<AnalyticsTrendCharts trends={trends} period="month" />);
    expect(screen.getByRole("button", { name: "Stacked" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trend" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Trend" }));
    // Both buttons still present after switch
    expect(screen.getByRole("button", { name: "Trend" })).toBeInTheDocument();
  });

  it("hides leave toggle when no leave data", () => {
    render(
      <AnalyticsTrendCharts
        trends={{ overtime: [], standby: [], leave: [], user_activity: [] }}
        period="month"
      />
    );
    expect(screen.queryByRole("button", { name: "Stacked" })).not.toBeInTheDocument();
  });
});
