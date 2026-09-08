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
});
