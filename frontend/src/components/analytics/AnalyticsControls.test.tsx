import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AnalyticsControls } from "./AnalyticsControls";

const baseProps = {
  periods: ["month", "year", "custom", "week"] as const,
  selectedPeriod: "month" as const,
  onPeriodChange: vi.fn(),
  dateRange: { from: "2024-01-01", to: "2024-01-31" },
  onDateRangeChange: vi.fn(),
  showFilters: false,
  onToggleFilters: vi.fn(),
  activeFilterCount: 0,
  exportFormat: "excel" as const,
  onExportFormatChange: vi.fn(),
  onExport: vi.fn(),
  onOpenSettings: vi.fn(),
};

describe("AnalyticsControls", () => {
  it("renders period buttons", () => {
    render(<AnalyticsControls {...baseProps} />);
    expect(screen.getByText("month")).toBeInTheDocument();
    expect(screen.getByText("year")).toBeInTheDocument();
  });

  it("calls onPeriodChange when clicking a period", () => {
    render(<AnalyticsControls {...baseProps} />);
    fireEvent.click(screen.getByText("year"));
    expect(baseProps.onPeriodChange).toHaveBeenCalledWith("year");
  });

  it("shows date inputs for custom period", () => {
    render(<AnalyticsControls {...baseProps} selectedPeriod="custom" />);
    expect(screen.getAllByDisplayValue("2024-01-01").length).toBeGreaterThan(0);
  });

  it("does not show date inputs for non-custom period", () => {
    render(<AnalyticsControls {...baseProps} />);
    expect(screen.queryAllByDisplayValue("2024-01-01").length).toBe(0);
  });

  it("calls onDateRangeChange when date changes", () => {
    render(<AnalyticsControls {...baseProps} selectedPeriod="custom" />);
    const fromInput = screen.getAllByDisplayValue("2024-01-01")[0];
    fireEvent.change(fromInput, { target: { value: "2024-02-01" } });
    expect(baseProps.onDateRangeChange).toHaveBeenCalled();
  });

  it("toggles filters", () => {
    render(<AnalyticsControls {...baseProps} />);
    fireEvent.click(screen.getByText("Advanced Filters"));
    expect(baseProps.onToggleFilters).toHaveBeenCalled();
  });

  it("shows filter count when active", () => {
    render(<AnalyticsControls {...baseProps} activeFilterCount={3} />);
    expect(screen.getByText("Filters (3)")).toBeInTheDocument();
  });

  it("triggers export", () => {
    render(<AnalyticsControls {...baseProps} />);
    fireEvent.click(screen.getByText("Export"));
    expect(baseProps.onExport).toHaveBeenCalled();
  });

  it("opens settings", () => {
    render(<AnalyticsControls {...baseProps} />);
    fireEvent.click(screen.getByText("Settings"));
    expect(baseProps.onOpenSettings).toHaveBeenCalled();
  });
});
