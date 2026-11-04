import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CalendarFormDialog } from "./CalendarFormDialog";

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  title: "New Vacation",
  requestType: "vacation" as const,
  onRequestTypeChange: vi.fn(),
  duration: "full" as const,
  onDurationChange: vi.fn(),
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

describe("CalendarFormDialog duration", () => {
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

  it("offers full day, morning and afternoon for vacation and reports the pick", () => {
    const onDurationChange = vi.fn();
    render(<CalendarFormDialog {...baseProps} onDurationChange={onDurationChange} />);

    fireEvent.click(screen.getByRole("radio", { name: /afternoon/i }));

    expect(onDurationChange).toHaveBeenCalledWith("afternoon");
  });

  it("hides the duration for sick leave", () => {
    render(<CalendarFormDialog {...baseProps} requestType="sick" />);
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("says a half day deducts 0.5 days", () => {
    render(<CalendarFormDialog {...baseProps} duration="morning" />);
    expect(screen.getByText(/deducts 0\.5 days/i)).toBeInTheDocument();
  });
});

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

    fireEvent.click(screen.getByText("12"));
    fireEvent.click(screen.getByText("14"));

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onDateRangeChange).toHaveBeenCalledWith("2026-09-12", "2026-09-14");
  });
});
