import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ReportKpiStrip } from "./ReportKpiStrip";
import type { SummaryReport } from "@/services/reportService";

const summary: SummaryReport = {
  overtime: { total_hours: 12.5, total_entries: 4, approved_hours: 10, pending_count: 2 },
  standby: { total_hours: 30, total_entries: 3, approved_hours: 30, pending_count: 0 },
  leave: { total_requests: 5, total_days: 14, approved_days: 9, pending_count: 1 },
};

const renderStrip = (tab: "overtime_standby" | "vacation", s: SummaryReport) =>
  render(
    <MemoryRouter>
      <ReportKpiStrip tab={tab} summary={s} scopeLabel="All teams" />
    </MemoryRouter>
  );

describe("ReportKpiStrip", () => {
  it("shows the four OT values", () => {
    renderStrip("overtime_standby", summary);
    expect(screen.getByText("12.5h")).toBeInTheDocument();
    expect(screen.getByText("30h")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("10h approved · 2 pending")).toBeInTheDocument();
  });

  it("renders dashes, never NaN, when standby is missing", () => {
    renderStrip("overtime_standby", { overtime: summary.overtime });
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not included in this report").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/NaN|undefined/);
  });

  it("shows leave values on the vacation tab", () => {
    renderStrip("vacation", summary);
    expect(screen.getByText("14d")).toBeInTheDocument();
    expect(screen.getByText("9d")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });
});
