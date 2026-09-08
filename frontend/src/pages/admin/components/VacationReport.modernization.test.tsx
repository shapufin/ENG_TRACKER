import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { VacationReport } from "./VacationReport";

vi.mock("@/components/ui/AnimatedNumber", () => ({
  AnimatedNumber: ({ value }: any) => <span>{value}</span>,
}));
vi.mock("./ChartAxisGrid", () => ({ ChartAxisGrid: () => null }));
vi.mock("recharts", () => ({
  LineChart: ({ children }: any) => <div>{children}</div>,
  Line: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
}));

const summaryData = {
  leave: { total_days: 10, approved_days: 8, pending_count: 2, total_requests: 5 },
};

describe("VacationReport modernization", () => {
  it("does not use raw green/orange color classes (semantic tokens only)", () => {
    const { container } = render(
      <VacationReport summaryData={summaryData} detailedData={{ leave: [] }} groupBy="month" />
    );
    expect(container.innerHTML).not.toMatch(/text-green-|bg-green-|border-t-green-/);
    expect(container.innerHTML).not.toMatch(/text-orange-|border-l-orange-/);
  });

  it("renders numeric values with tabular-nums", () => {
    const { container } = render(
      <VacationReport summaryData={summaryData} detailedData={{ leave: [] }} groupBy="month" />
    );
    expect(container.innerHTML).toContain("tabular-nums");
  });
});
