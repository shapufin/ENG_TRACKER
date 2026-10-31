import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HRInsightsCard } from "./HRInsightsCard";

describe("HRInsightsCard", () => {
  it("shows a dash and asks for a range when there is no comparison", () => {
    render(
      <HRInsightsCard
        insightsData={{ overtime_increase: null, leave_utilization: 25, standby_hours: 4 }}
      />
    );
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Select a date range")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText("4h")).toBeInTheDocument();
  });

  it("shows the comparison when a range was supplied", () => {
    render(
      <HRInsightsCard
        insightsData={{ overtime_increase: 12.5, leave_utilization: null, standby_hours: 0 }}
      />
    );
    expect(screen.getByText("12.5%")).toBeInTheDocument();
    expect(screen.getByText("vs previous period")).toBeInTheDocument();
  });
});
