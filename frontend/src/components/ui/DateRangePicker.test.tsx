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

  it("opens one view with quick ranges, a calendar and Start and End fields", () => {
    render(<DateRangePicker from="" to="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /open date range/i }));
    expect(screen.getByRole("button", { name: "This month" })).toBeInTheDocument();
    expect(screen.getByText("June 2024")).toBeInTheDocument();
    expect(screen.getByLabelText("Start date")).toBeInTheDocument();
    expect(screen.getByLabelText("End date")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
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

  const open = (from = "", to = "", onChange = vi.fn()) => {
    render(<DateRangePicker from={from} to={to} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /open date range/i }));
    return onChange;
  };

  it("selects a custom range across two clicks and commits on Apply", () => {
    const onChange = open();
    fireEvent.click(screen.getByText("16"));
    fireEvent.click(screen.getByText("20"));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onChange).toHaveBeenCalledWith({ from: "2024-06-16", to: "2024-06-20" });
  });

  it("walks the person through start then end", () => {
    open();
    expect(screen.getByText("Pick the start date")).toBeInTheDocument();
    fireEvent.click(screen.getByText("16"));
    expect(screen.getByText("Now pick the end date")).toBeInTheDocument();
    fireEvent.click(screen.getByText("20"));
    expect(screen.getByText("5 days selected")).toBeInTheDocument();
  });

  it("fills the Start and End fields as days are clicked", () => {
    open();
    fireEvent.click(screen.getByText("16"));
    fireEvent.click(screen.getByText("20"));
    expect(screen.getByLabelText("Start date")).toHaveValue("16/06/2024");
    expect(screen.getByLabelText("End date")).toHaveValue("20/06/2024");
  });

  it("marks both ends of the range as selected", () => {
    open();
    fireEvent.click(screen.getByText("16"));
    fireEvent.click(screen.getByText("20"));
    expect(screen.getByText("16")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("20")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("18")).toHaveAttribute("aria-pressed", "false");
  });

  it("treats an earlier second click as the start and keeps the first as the end", () => {
    const onChange = open();
    fireEvent.click(screen.getByText("20"));
    fireEvent.click(screen.getByText("16"));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onChange).toHaveBeenCalledWith({ from: "2024-06-16", to: "2024-06-20" });
  });

  it("applies a single day when only the start was picked", () => {
    const onChange = open();
    fireEvent.click(screen.getByText("16"));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onChange).toHaveBeenCalledWith({ from: "2024-06-16", to: "2024-06-16" });
  });

  it("takes dates typed into the fields", () => {
    const onChange = open();
    const start = screen.getByLabelText("Start date");
    fireEvent.change(start, { target: { value: "03/06/2024" } });
    fireEvent.blur(start);
    const end = screen.getByLabelText("End date");
    fireEvent.change(end, { target: { value: "09/06/2024" } });
    fireEvent.blur(end);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onChange).toHaveBeenCalledWith({ from: "2024-06-03", to: "2024-06-09" });
  });

  it("swaps a typed end date that comes before the start", () => {
    const onChange = open("2024-06-10", "2024-06-12");
    const end = screen.getByLabelText("End date");
    fireEvent.change(end, { target: { value: "02/06/2024" } });
    fireEvent.blur(end);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onChange).toHaveBeenCalledWith({ from: "2024-06-02", to: "2024-06-10" });
  });

  it("discards the draft range on Cancel", () => {
    const onChange = open("2024-06-01", "2024-06-05");
    fireEvent.click(screen.getByText("20"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("01/06/2024 - 05/06/2024")).toBeInTheDocument();
  });

  it("is disabled when the disabled prop is set", () => {
    render(<DateRangePicker from="" to="" onChange={vi.fn()} disabled />);
    expect(screen.getByRole("button", { name: /open date range/i })).toBeDisabled();
  });
});
