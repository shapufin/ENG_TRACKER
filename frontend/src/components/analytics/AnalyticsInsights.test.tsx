import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnalyticsInsights } from "./AnalyticsInsights";
import type { AnalyticsInsight } from "./types";

const sampleInsights: AnalyticsInsight[] = [
  {
    type: "trend_up",
    severity: "warning",
    title: "Overtime hours up 25%",
    description: "Overtime totaled 120h this period vs 96h in the previous 30 days.",
    metric: "Overtime Hours",
    change: 25,
  },
  {
    type: "concentration",
    severity: "warning",
    title: "John Doe accounts for 55% of overtime",
    description: "John Doe logged 66h out of 120h total — potential burnout risk.",
    metric: "Overtime Concentration",
    change: 55,
  },
  {
    type: "backlog",
    severity: "warning",
    title: "12 leave requests pending approval",
    description: "12 leave requests are awaiting approval.",
    metric: "Pending Leave",
    change: 0,
  },
];

describe("AnalyticsInsights", () => {
  it("renders nothing when insights is undefined", () => {
    const { container } = render(<AnalyticsInsights insights={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when insights is empty", () => {
    const { container } = render(<AnalyticsInsights insights={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows loading state when isLoading is true", () => {
    render(<AnalyticsInsights insights={undefined} isLoading />);
    expect(screen.getByText("Analyzing patterns...")).toBeInTheDocument();
  });

  it("renders header with insight count", () => {
    render(<AnalyticsInsights insights={sampleInsights} />);
    expect(screen.getByText("Automated Insights")).toBeInTheDocument();
    expect(screen.getByText("3 findings")).toBeInTheDocument();
  });

  it("renders singular 'finding' for one insight", () => {
    render(<AnalyticsInsights insights={[sampleInsights[0]]} />);
    expect(screen.getByText("1 finding")).toBeInTheDocument();
  });

  it("renders all insight titles", () => {
    render(<AnalyticsInsights insights={sampleInsights} />);
    expect(screen.getByText("Overtime hours up 25%")).toBeInTheDocument();
    expect(screen.getByText("John Doe accounts for 55% of overtime")).toBeInTheDocument();
    expect(screen.getByText("12 leave requests pending approval")).toBeInTheDocument();
  });

  it("renders insight descriptions", () => {
    render(<AnalyticsInsights insights={sampleInsights} />);
    expect(screen.getByText(/Overtime totaled 120h this period/)).toBeInTheDocument();
  });
});
