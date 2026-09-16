import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CalendarFormDialog } from "./CalendarFormDialog";

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  title: "New Vacation",
  requestType: "vacation" as const,
  onRequestTypeChange: vi.fn(),
  selectedDates: { start: "2026-09-10", end: "2026-09-10" },
  onDateRangeChange: vi.fn(),
  reason: "",
  onReasonChange: vi.fn(),
  carryOverAndBalance: {},
  isSubmitting: false,
  isError: false,
  error: null,
  onSubmit: vi.fn(),
};

describe("CalendarFormDialog date range picker", () => {
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

  it("shows the pre-filled start and end dates in the trigger", () => {
    render(<CalendarFormDialog {...baseProps} />);
    expect(screen.getByText("10/09/2026 - 10/09/2026")).toBeInTheDocument();
  });

  it("shows a placeholder when no dates are selected yet (header CTA before a range is set)", () => {
    render(<CalendarFormDialog {...baseProps} selectedDates={null} />);
    expect(screen.getByText("Select dates")).toBeInTheDocument();
  });

  it("reports a new range picked from the calendar", () => {
    const onDateRangeChange = vi.fn();
    render(<CalendarFormDialog {...baseProps} onDateRangeChange={onDateRangeChange} />);
    fireEvent.click(screen.getByRole("button", { name: /open date range/i }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Custom Range" }));

    const dayButtons12 = screen.getAllByText("12");
    fireEvent.click(dayButtons12[0]);
    const dayButtons14 = screen.getAllByText("14");
    fireEvent.click(dayButtons14[0]);

    const saveButtons = screen.getAllByRole("button", { name: "Save" });
    fireEvent.click(saveButtons[saveButtons.length - 1]);
    expect(onDateRangeChange).toHaveBeenCalledWith("2026-09-12", "2026-09-14");
  });
});
