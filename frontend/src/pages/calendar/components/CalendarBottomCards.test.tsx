import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CalendarBottomCards } from "./CalendarBottomCards";

const metricBars = [
  { label: "Remaining", value: "12d of 22d", progress: 55, colorClass: "bg-primary" },
  { label: "Used", value: "8d of 22d", progress: 36, colorClass: "bg-info" },
  { label: "Pending", value: "2d of 22d", progress: 9, colorClass: "bg-warning" },
];

const baseProps = {
  vacationSummary: { remainingDays: 12, totalDays: 22 },
  carryOverAndBalance: {},
  metricBars,
  conflictEntries: [],
  onViewAllConflicts: vi.fn(),
};

describe("CalendarBottomCards", () => {
  it("summarises the remaining balance against the annual allowance", () => {
    render(<CalendarBottomCards {...baseProps} />);

    expect(screen.getByRole("button", { name: "Vacation balance" })).toHaveTextContent("12d");
    expect(screen.getByRole("button", { name: "Vacation balance" })).toHaveTextContent("22d total");
  });

  it("coerces decimal-string balances from the API before printing them", () => {
    render(
      <CalendarBottomCards
        {...baseProps}
        carryOverAndBalance={{
          carryOver: { available_days: "4.5", year: 2025, effective_available_days: 4.5 },
        }}
      />
    );

    const card = screen.getByRole("button", { name: "Carry-over" });
    expect(card).toHaveTextContent("4.5d");
    expect(card).toHaveTextContent("from 2025");
  });

  it("falls back to the raw balance when there is no effective figure", () => {
    render(
      <CalendarBottomCards
        {...baseProps}
        carryOverAndBalance={{ carryOver: { available_days: "3", year: 2025 } }}
      />
    );

    expect(screen.getByRole("button", { name: "Carry-over" })).toHaveTextContent("3d");
  });

  it("says there is nothing when no carry-over was granted", () => {
    render(<CalendarBottomCards {...baseProps} />);

    expect(screen.getByRole("button", { name: "Carry-over" })).toHaveTextContent("none");
  });

  it("counts staffing conflicts and names the first one", () => {
    render(
      <CalendarBottomCards
        {...baseProps}
        conflictEntries={[
          { date: "12 Nov", description: "Coverage at 40%" },
          { date: "19 Nov", description: "Coverage at 50%" },
        ]}
      />
    );

    const card = screen.getByRole("button", { name: "Upcoming conflicts" });
    expect(card).toHaveTextContent("2 staffing alerts");
    expect(card).toHaveTextContent("12 Nov");
  });

  it("reports a clean month when nothing is at risk", () => {
    render(<CalendarBottomCards {...baseProps} />);

    expect(screen.getByRole("button", { name: "Upcoming conflicts" })).toHaveTextContent(
      "No conflicts this month"
    );
  });

  it("opens the conflicts and balance surfaces", () => {
    const onOpenBalanceModal = vi.fn();
    render(<CalendarBottomCards {...baseProps} onOpenBalanceModal={onOpenBalanceModal} />);

    fireEvent.click(screen.getByRole("button", { name: "Upcoming conflicts" }));
    expect(baseProps.onViewAllConflicts).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Vacation balance" }));
    expect(onOpenBalanceModal).toHaveBeenCalledTimes(1);
  });
});
