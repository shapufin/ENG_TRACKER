import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HoursTrendWidget } from "./HoursTrendWidget";
import { makeTrends } from "./adminFixtures";

vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 600, height: 240 }}>{children}</div>
    ),
  };
});

const base = {
  hoursData: [
    { label: "Overtime", hours: 12.5 },
    { label: "Standby", hours: 16 },
  ],
  period: "12" as const,
  onPeriodChange: () => {},
  data: makeTrends(),
};

describe("HoursTrendWidget", () => {
  it("opens on This month, marked for PDF export", () => {
    const { container } = render(<HoursTrendWidget {...base} />);
    expect(screen.getByRole("tab", { name: "This month", selected: true })).toBeInTheDocument();
    expect(container.querySelector("[data-chart-section='hours-trend']")).not.toBeNull();
    expect(screen.queryByRole("group", { name: "Trend period" })).toBeNull();
  });

  it("shows a skeleton on This month while stats load", () => {
    render(<HoursTrendWidget {...base} statsLoading />);
    expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
  });

  it("Trend tab shows the chart caption and the period selector", async () => {
    const onPeriodChange = vi.fn();
    render(<HoursTrendWidget {...base} onPeriodChange={onPeriodChange} />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Trend" }));
    expect(screen.getByText(/last 12 months/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "6 months" }));
    expect(onPeriodChange).toHaveBeenCalledWith("6");
  });

  it("Trend tab shows an empty state when there are no hours", async () => {
    const empty = makeTrends({
      hours: {
        overtime: Array(12).fill(0),
        standby: Array(12).fill(0),
        pending_overtime: Array(12).fill(0),
      },
    });
    render(<HoursTrendWidget {...base} data={empty} />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Trend" }));
    expect(screen.getByText("No hours yet")).toBeInTheDocument();
  });

  it("Trend tab shows a retry when the trends request failed", async () => {
    const onRetry = vi.fn();
    render(<HoursTrendWidget {...base} data={undefined} isError onRetry={onRetry} />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Trend" }));
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
