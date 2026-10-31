import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HRDashboardCharts } from "./HRDashboardCharts";

describe("HRDashboardCharts", () => {
  it("shows an empty state instead of a bare grid when there is no monthly data", () => {
    const { container } = render(<HRDashboardCharts monthlyData={[]} statusBars={[]} />);

    expect(screen.getByText("No approved hours for this period.")).toBeInTheDocument();
    expect(container.querySelector(".recharts-wrapper")).not.toBeInTheDocument();
  });

  it("does not crash when monthlyData is null (loading callers pass null)", () => {
    const { container } = render(
      <HRDashboardCharts monthlyData={null as unknown as []} statusBars={[]} />
    );

    expect(screen.getByText("No approved hours for this period.")).toBeInTheDocument();
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

  it("scales each pipeline bar against every request, not a fixed 20", () => {
    const { container } = render(
      <HRDashboardCharts
        monthlyData={[{ day: "Mon", overtime: 4 }]}
        statusBars={[
          { label: "Pending", value: 30, tone: "warning" },
          { label: "Approved", value: 10, tone: "success" },
          { label: "Rejected", value: 0, tone: "danger" },
        ]}
      />
    );
    const fills = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid="hr-pipeline-fill"]')
    );
    expect(fills.map((fill) => fill.style.width)).toEqual(["75%", "25%", "0%"]);
  });

  it("paints pipeline bars with the tone scale, never raw palette classes", () => {
    const { container } = render(
      <HRDashboardCharts
        monthlyData={[{ day: "Mon", overtime: 4 }]}
        statusBars={[
          { label: "Pending", value: 1, tone: "warning" },
          { label: "Approved", value: 1, tone: "success" },
          { label: "Rejected", value: 1, tone: "danger" },
        ]}
      />
    );
    const fills = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid="hr-pipeline-fill"]')
    );
    expect(fills[0].className).toContain("bg-tone-warning-text");
    expect(fills[1].className).toContain("bg-tone-success-text");
    expect(fills[2].className).toContain("bg-tone-danger-text");
    for (const fill of fills) {
      expect(fill.className).not.toMatch(/bg-(amber|emerald|rose)-/);
    }
  });
});
