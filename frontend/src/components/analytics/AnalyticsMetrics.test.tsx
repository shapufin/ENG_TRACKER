import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnalyticsMetrics } from "./AnalyticsMetrics";
import type { AnalyticsMetric } from "./types";

// AnimatedNumber uses framer-motion springs which don't animate in jsdom.
// Mock it to render the raw value so tests can assert on displayed numbers.
vi.mock("@/components/ui/AnimatedNumber", () => ({
  AnimatedNumber: ({ value, suffix = "" }: { value: number; suffix?: string }) => (
    <span>
      {value}
      {suffix}
    </span>
  ),
}));

const metrics: AnalyticsMetric[] = [
  { name: "Active Users", value: 10, unit: "", trend: "up", change: 5 },
  { name: "Overtime Hours", value: 100, unit: "h", trend: "down", change: -3 },
  { name: "Utilization", value: 85, unit: "%", trend: "stable", change: 0 },
  { name: "Tickets", value: 20, unit: "", trend: "up", change: 2 },
];

describe("AnalyticsMetrics", () => {
  it("renders loading state with 4 skeleton cards", () => {
    render(<AnalyticsMetrics metrics={[]} isLoading={true} error={null} />);
    expect(document.querySelectorAll(".animate-pulse").length).toBe(4);
  });

  it("renders error state", () => {
    render(<AnalyticsMetrics metrics={[]} isLoading={false} error={new Error("fail")} />);
    expect(screen.getByText("Failed to load analytics data")).toBeInTheDocument();
  });

  it("renders metric card titles", () => {
    render(<AnalyticsMetrics metrics={metrics} isLoading={false} error={null} />);
    expect(screen.getByText("Active Users")).toBeInTheDocument();
    expect(screen.getByText("Overtime Hours")).toBeInTheDocument();
    expect(screen.getByText("Utilization")).toBeInTheDocument();
    expect(screen.getByText("Tickets")).toBeInTheDocument();
  });

  it("renders metric values via AnimatedNumber", () => {
    const { container } = render(
      <AnalyticsMetrics metrics={metrics} isLoading={false} error={null} />
    );
    expect(container.textContent).toContain("85");
    expect(container.textContent).toContain("100");
  });

  it("renders trend text for each metric", () => {
    render(<AnalyticsMetrics metrics={metrics} isLoading={false} error={null} />);
    expect(screen.getByText("+5% vs prev")).toBeInTheDocument();
    expect(screen.getByText("-3% vs prev")).toBeInTheDocument();
    expect(screen.getByText("0% vs prev")).toBeInTheDocument();
  });

  it("renders nothing when metrics array is empty", () => {
    const { container } = render(<AnalyticsMetrics metrics={[]} isLoading={false} error={null} />);
    expect(container.querySelectorAll(".grid > div").length).toBe(0);
  });
});
