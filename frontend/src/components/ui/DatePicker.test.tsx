import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DatePicker } from "./DatePicker";

describe("DatePicker", () => {
  it("renders with placeholder", () => {
    render(<DatePicker value="" onChange={vi.fn()} placeholder="DD/MM/YYYY" />);
    expect(screen.getByPlaceholderText("DD/MM/YYYY")).toBeInTheDocument();
  });

  it("displays formatted value", () => {
    render(<DatePicker value="2024-06-15" onChange={vi.fn()} />);
    expect(screen.getByDisplayValue("15/06/2024")).toBeInTheDocument();
  });

  it("auto-inserts slashes and calls onChange for valid date", () => {
    const onChange = vi.fn();
    const { rerender } = render(<DatePicker value="" onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "15062024" } });
    rerender(<DatePicker value="2024-06-15" onChange={onChange} />);
    expect(input).toHaveValue("15/06/2024");
    expect(onChange).toHaveBeenCalledWith("2024-06-15");
  });

  it("does not call onChange for incomplete input", () => {
    const onChange = vi.fn();
    render(<DatePicker value="" onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "15" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("validates on blur and calls onChange for valid date", () => {
    const onChange = vi.fn();
    render(<DatePicker value="" onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "15/06/2024" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("2024-06-15");
  });

  it("does not call onChange for invalid date on blur", () => {
    const onChange = vi.fn();
    render(<DatePicker value="" onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "31/02/2024" } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("respects disabled state", () => {
    render(<DatePicker value="" onChange={vi.fn()} disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});
