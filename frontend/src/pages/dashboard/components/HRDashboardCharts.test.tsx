import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HRDashboardCharts } from "./HRDashboardCharts";

describe("HRDashboardCharts", () => {
  it("shows an empty state instead of a bare grid when there is no monthly data", () => {
    const { container } = render(<HRDashboardCharts monthlyData={[]} statusBars={[]} />);

    expect(screen.getByText("No overtime data for this period.")).toBeInTheDocument();
    expect(container.querySelector(".recharts-wrapper")).not.toBeInTheDocument();
  });

  it("does not crash when monthlyData is null (loading callers pass null)", () => {
    const { container } = render(
      <HRDashboardCharts monthlyData={null as unknown as []} statusBars={[]} />
    );

    expect(screen.getByText("No overtime data for this period.")).toBeInTheDocument();
    expect(container.querySelector(".recharts-wrapper")).not.toBeInTheDocument();
  });

  it("renders pipeline bars with real values", () => {
    render(
      <HRDashboardCharts
        monthlyData={[{ day: "Mon", overtime: 4 }]}
        statusBars={[
          { label: "Pending", value: 7 },
          { label: "Approved", value: 7 },
        ]}
      />
    );

    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getAllByText("7")).toHaveLength(2);
  });
});
