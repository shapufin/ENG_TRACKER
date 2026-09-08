import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { VacationReport } from "./VacationReport";

vi.mock("@/components/ui/AnimatedNumber", () => ({
  AnimatedNumber: ({ value }: any) => <span>{value}</span>,
}));
vi.mock("@/components/ui/GlassCard", () => ({
  GlassCard: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("./ChartAxisGrid", () => ({ ChartAxisGrid: () => null }));
vi.mock("recharts", () => ({
  LineChart: ({ children }: any) => <div>{children}</div>,
  Line: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
}));

describe("VacationReport", () => {
  it("renders summary data", () => {
    const summaryData = {
      leave: { total_days: 10, approved_days: 8, pending_count: 2, total_requests: 5 },
    };
    render(
      <VacationReport summaryData={summaryData} detailedData={{ leave: [] }} groupBy="month" />
    );
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("renders trend chart when groupBy is not user", () => {
    const detailedData = { leave: [{ month: "2024-01", total_days: 5 }] };
    render(
      <VacationReport
        summaryData={{
          leave: { total_days: 5, approved_days: 5, pending_count: 0, total_requests: 1 },
        }}
        detailedData={detailedData}
        groupBy="month"
      />
    );
    expect(screen.getByText("Absence Trend Analysis")).toBeInTheDocument();
  });

  it("hides trend chart when groupBy is user", () => {
    render(
      <VacationReport
        summaryData={{
          leave: { total_days: 5, approved_days: 5, pending_count: 0, total_requests: 1 },
        }}
        detailedData={{ leave: [] }}
        groupBy="user"
      />
    );
    expect(screen.queryByText("Absence Trend Analysis")).not.toBeInTheDocument();
  });
});
