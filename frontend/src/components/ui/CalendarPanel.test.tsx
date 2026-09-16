import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CalendarPanel } from "./CalendarPanel";

describe("CalendarPanel", () => {
  it("renders current month and days", () => {
    render(<CalendarPanel value="2024-06-15" onSelect={vi.fn()} />);
    expect(screen.getByText("June 2024")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
  });

  it("navigates previous month", () => {
    render(<CalendarPanel value="2024-06-15" onSelect={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(screen.getByText("May 2024")).toBeInTheDocument();
  });

  it("navigates next month", () => {
    render(<CalendarPanel value="2024-06-15" onSelect={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("button")[1]);
    expect(screen.getByText("July 2024")).toBeInTheDocument();
  });

  it("selects a date", () => {
    const onSelect = vi.fn();
    render(<CalendarPanel value="2024-06-15" onSelect={onSelect} />);
    fireEvent.click(screen.getByText("20"));
    expect(onSelect).toHaveBeenCalledWith(expect.any(Date), "2024-06-20");
  });

  it("handles invalid value by defaulting to current month", () => {
    render(<CalendarPanel value="invalid" onSelect={vi.fn()} />);
    expect(screen.getByText("Mo")).toBeInTheDocument();
  });

  it("uses the controlled month prop instead of deriving from value", () => {
    render(<CalendarPanel value="2024-06-15" month={new Date(2024, 7, 1)} onSelect={vi.fn()} />);
    expect(screen.getByText("August 2024")).toBeInTheDocument();
  });

  it("calls onMonthChange instead of managing month internally when controlled", () => {
    const onMonthChange = vi.fn();
    render(
      <CalendarPanel
        value="2024-06-15"
        month={new Date(2024, 5, 1)}
        onMonthChange={onMonthChange}
        onSelect={vi.fn()}
      />
    );
    fireEvent.click(screen.getAllByRole("button")[1]);
    expect(onMonthChange).toHaveBeenCalledWith(new Date(2024, 6, 1));
    // Controlled: month prop didn't change, so the panel still shows June.
    expect(screen.getByText("June 2024")).toBeInTheDocument();
  });

  it("tints days between value and rangeEnd", () => {
    render(<CalendarPanel value="2024-06-10" rangeEnd="2024-06-14" onSelect={vi.fn()} />);
    const day12 = screen.getByText("12");
    expect(day12.className).toContain("bg-primary/10");
  });

  it("does not tint any day when rangeEnd is absent", () => {
    render(<CalendarPanel value="2024-06-10" onSelect={vi.fn()} />);
    const day12 = screen.getByText("12");
    expect(day12.className).not.toContain("bg-primary/10");
  });
});
