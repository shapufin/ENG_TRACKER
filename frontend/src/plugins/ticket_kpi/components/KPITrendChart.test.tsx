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

  it("renders empty chart", () => {
    render(<KPITrendChart title="Empty" data={[]} />);
    expect(screen.getByText("Empty")).toBeInTheDocument();
  });
});
