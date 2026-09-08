import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { OvertimeStandbyReport } from "./OvertimeStandbyReport";

vi.mock("./OvertimeAggregateCard", () => ({
  OvertimeAggregateCard: () => <div data-testid="overtime-card" />,
}));
vi.mock("./StandbyAggregateCard", () => ({
  StandbyAggregateCard: () => <div data-testid="standby-card" />,
}));
vi.mock("./OvertimeStandbyTrendChart", () => ({
  OvertimeStandbyTrendChart: () => <div data-testid="trend-chart" />,
}));

describe("OvertimeStandbyReport", () => {
  it("renders overtime and standby cards", () => {
    const summaryData = {
      overtime: { total_hours: 10, approved_hours: 8, total_entries: 2, pending_count: 1 },
      standby: { total_hours: 5, approved_hours: 5, total_entries: 1, pending_count: 0 },
    };
    render(
      <OvertimeStandbyReport
        summaryData={summaryData}
        detailedData={{ overtime: [], standby: [] }}
        groupBy="month"
      />
    );
    expect(screen.getByTestId("overtime-card")).toBeInTheDocument();
    expect(screen.getByTestId("standby-card")).toBeInTheDocument();
    expect(screen.getByTestId("trend-chart")).toBeInTheDocument();
  });

  it("hides trend chart when groupBy is user", () => {
    render(
      <OvertimeStandbyReport
        summaryData={{
          overtime: { total_hours: 10, approved_hours: 8, total_entries: 2, pending_count: 1 },
        }}
        detailedData={{ overtime: [], standby: [] }}
        groupBy="user"
      />
    );
    expect(screen.getByTestId("overtime-card")).toBeInTheDocument();
    expect(screen.queryByTestId("trend-chart")).not.toBeInTheDocument();
  });

  it("renders empty when no summary", () => {
    render(<OvertimeStandbyReport groupBy="month" />);
    expect(screen.queryByTestId("overtime-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("standby-card")).not.toBeInTheDocument();
  });
});
