import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ReportCatalog } from "./ReportCatalog";
import type { SummaryReport } from "@/services/reportService";

const summary: SummaryReport = {
  overtime: { total_hours: 12.5, total_entries: 4, approved_hours: 10, pending_count: 2 },
  standby: { total_hours: 30, total_entries: 3, approved_hours: 30, pending_count: 0 },
  leave: { total_requests: 5, total_days: 14, approved_days: 9, pending_count: 1 },
};

const setup = (
  s: SummaryReport | null,
  tab: "overtime_standby" | "vacation" = "overtime_standby"
) => {
  const onExport = vi.fn();
  const onView = vi.fn();
  render(
    <TooltipProvider>
      <ReportCatalog
        tab={tab}
        summary={s}
        start="2026-05-01"
        end="2026-05-31"
        scopeLabel="All teams"
        canExport
        onExport={onExport}
        onView={onView}
      />
    </TooltipProvider>
  );
  return { onExport, onView };
};

describe("ReportCatalog", () => {
  it("renders two OT cards with records and totals", () => {
    setup(summary);
    expect(screen.getByRole("heading", { name: "Overtime ledger" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Standby ledger" })).toBeInTheDocument();
    expect(screen.getAllByText("XLSX")).toHaveLength(2);
    expect(screen.getAllByText("All teams")).toHaveLength(2);
    expect(screen.getByText("12.5h")).toBeInTheDocument();
    expect(screen.getByText("30h")).toBeInTheDocument();
  });

  it("renders the vacation card on the vacation tab", () => {
    setup(summary, "vacation");
    expect(screen.getByRole("heading", { name: "Vacation ledger" })).toBeInTheDocument();
    expect(screen.getByText("14d")).toBeInTheDocument();
  });

  it("disables export without a summary and shows no NaN", () => {
    setup(null);
    for (const b of screen.getAllByRole("button", { name: /Export XLSX/ })) {
      expect(b).toBeDisabled();
    }
    expect(document.body.textContent).not.toMatch(/NaN|undefined/);
  });

  it("calls onExport and onView", () => {
    const { onExport, onView } = setup(summary);
    fireEvent.click(screen.getAllByRole("button", { name: /Export XLSX/ })[0]);
    expect(onExport).toHaveBeenCalledWith("overtime");
    fireEvent.click(screen.getAllByRole("button", { name: /^View/ })[0]);
    expect(onView).toHaveBeenCalled();
  });
});
