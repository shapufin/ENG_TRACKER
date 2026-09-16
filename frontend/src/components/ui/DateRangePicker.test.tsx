import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DateRangePicker } from "./DateRangePicker";

describe("DateRangePicker", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      }
    );
    vi.setSystemTime(new Date(2024, 5, 15)); // June 15, 2024
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows a placeholder when no range is set", () => {
    render(<DateRangePicker from="" to="" onChange={vi.fn()} placeholder="Pick a range" />);
    expect(screen.getByText("Pick a range")).toBeInTheDocument();
  });

  it("shows the formatted range in the trigger when set", () => {
    render(<DateRangePicker from="2024-06-01" to="2024-06-10" onChange={vi.fn()} />);
    expect(screen.getByText("01/06/2024 - 10/06/2024")).toBeInTheDocument();
  });

  it("opens the popover with Quick Ranges and Custom Range tabs", () => {
    render(<DateRangePicker from="" to="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /open date range/i }));
    expect(screen.getByRole("tab", { name: "Quick Ranges" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Custom Range" })).toBeInTheDocument();
  });

  it("applies the 'This month' quick range and closes", () => {
    const onChange = vi.fn();
    render(<DateRangePicker from="" to="" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /open date range/i }));
    fireEvent.click(screen.getByRole("button", { name: "This month" }));
    expect(onChange).toHaveBeenCalledWith({ from: "2024-06-01", to: "2024-06-30" });
  });

  it("applies the 'Last month' quick range", () => {
    const onChange = vi.fn();
    render(<DateRangePicker from="" to="" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /open date range/i }));
    fireEvent.click(screen.getByRole("button", { name: "Last month" }));
    expect(onChange).toHaveBeenCalledWith({ from: "2024-05-01", to: "2024-05-31" });
  });

  it("applies the 'Today' quick range", () => {
    const onChange = vi.fn();
    render(<DateRangePicker from="" to="" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /open date range/i }));
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(onChange).toHaveBeenCalledWith({ from: "2024-06-15", to: "2024-06-15" });
  });

  it("selects a custom range across two clicks and commits on Save", () => {
    const onChange = vi.fn();
    render(<DateRangePicker from="" to="" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /open date range/i }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Custom Range" }));

    const dayButtons16 = screen.getAllByText("16");
    fireEvent.click(dayButtons16[0]);
    const dayButtons20 = screen.getAllByText("20");
    fireEvent.click(dayButtons20[0]);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onChange).toHaveBeenCalledWith({ from: "2024-06-16", to: "2024-06-20" });
  });

  it("discards the draft range on Cancel", () => {
    const onChange = vi.fn();
    render(<DateRangePicker from="2024-06-01" to="2024-06-05" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /open date range/i }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Custom Range" }));

    const dayButtons20 = screen.getAllByText("20");
    fireEvent.click(dayButtons20[0]);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("01/06/2024 - 05/06/2024")).toBeInTheDocument();
  });

  it("is disabled when the disabled prop is set", () => {
    render(<DateRangePicker from="" to="" onChange={vi.fn()} disabled />);
    expect(screen.getByRole("button", { name: /open date range/i })).toBeDisabled();
  });
});
