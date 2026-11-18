import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { KPITrendChart } from "./KPITrendChart";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 300, height: 300 }}>{children}</div>
    ),
  };
});

const data = [
  { month: "Jan", tickets: 10, avgHours: 2 },
  { month: "Feb", tickets: 15, avgHours: 3 },
];

describe("KPITrendChart", () => {
  it("renders title and chart", () => {
    const { container } = render(<KPITrendChart title="Trend" data={data} gradientId="myGrad" />);
    expect(screen.getByText("Trend")).toBeInTheDocument();
    expect(container.querySelector('[class*="h-80"]')).toBeInTheDocument();
  });

  it("gives screen readers the resolution times too, and skips empty months", () => {
    const { container } = render(
      <KPITrendChart
        title="T"
        data={[
          { month: "2026-04", tickets: 4, avgHours: null, p50: 5.25, p90: 20 },
          { month: "2026-05", tickets: 0, avgHours: null, p50: null, p90: null },
        ]}
      />
    );
    const text = container.querySelector(".sr-only")?.textContent;
    expect(text).toBe(
      "Apr '26: 4 tickets, median 5.3 hours, slowest 10% 20 hours. May '26: 0 tickets"
    );
  });

  it("renders empty chart", () => {
    render(<KPITrendChart title="Empty" data={[]} />);
    expect(screen.getByText("Empty")).toBeInTheDocument();
  });
});
