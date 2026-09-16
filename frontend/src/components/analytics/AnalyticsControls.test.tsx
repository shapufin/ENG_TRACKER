import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("shows the date range picker for custom period", () => {
    render(<AnalyticsControls {...baseProps} selectedPeriod="custom" />);
    expect(screen.getByRole("button", { name: /open date range/i })).toBeInTheDocument();
  });

  it("does not show the date range picker for non-custom period", () => {
    render(<AnalyticsControls {...baseProps} />);
    expect(screen.queryByRole("button", { name: /open date range/i })).not.toBeInTheDocument();
  });

  it("calls onDateRangeChange when applying the 'Today' quick range", () => {
    render(<AnalyticsControls {...baseProps} selectedPeriod="custom" />);
    fireEvent.click(screen.getByRole("button", { name: /open date range/i }));
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
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
