import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MonthlyComparisonCard } from "./MonthlyComparisonCard";

vi.mock("./TrendIndicator", () => ({ TrendIndicator: () => <div data-testid="trend" /> }));

describe("MonthlyComparisonCard", () => {
  it("renders with full data", () => {
    const data = {
      current_month: { month_name: "Jan", data: { total: 10 }, daily_average: 5 },
      previous_month: { month_name: "Dec", data: { total: 8 }, daily_average: 4 },
      comparison: { trend: "up", percent_change: 25 },
    } as any;
    render(<MonthlyComparisonCard data={data} />);
    expect(screen.getByText("Monthly Comparison")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("Jan")).toBeInTheDocument();
    expect(screen.getByText("Dec")).toBeInTheDocument();
  });

  it("renders with missing data", () => {
    render(<MonthlyComparisonCard />);
    expect(screen.getByText("Monthly Comparison")).toBeInTheDocument();
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(2);
  });
});
