import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { AnalyticsMetrics } from "./AnalyticsMetrics";
import type { AnalyticsMetric } from "./types";

// AnimatedNumber uses framer-motion springs which don't animate in jsdom.
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

describe("AnalyticsMetrics modernization", () => {
  it("uses shared ui/StatCard (no gradient icon boxes)", () => {
    const { container } = render(
      <AnalyticsMetrics metrics={metrics} isLoading={false} error={null} />
    );
    // dashboard/StatCard uses bg-gradient-to-br on icon boxes; ui/StatCard does not
    expect(container.querySelectorAll(".bg-gradient-to-br").length).toBe(0);
  });

  it("renders tabular-nums values", () => {
    const { container } = render(
      <AnalyticsMetrics metrics={metrics} isLoading={false} error={null} />
    );
    expect(container.querySelectorAll(".tabular-nums").length).toBeGreaterThanOrEqual(4);
  });
});
