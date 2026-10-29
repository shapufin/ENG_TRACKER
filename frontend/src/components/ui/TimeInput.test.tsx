import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { TimeInput } from "./TimeInput";

const Harness = ({
  initial = "",
  onValue = vi.fn(),
}: {
  initial?: string;
  onValue?: (v: string) => void;
}) => {
  const [value, setValue] = useState(initial);
  return (
    <TimeInput
      aria-label="Start"
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue(v);
      }}
    />
  );
};

const type = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } });

describe("TimeInput", () => {
  it("turns 09 into 09:00 AM when the field is left", () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    const field = screen.getByLabelText("Start");
    type(field, "09");
    fireEvent.blur(screen.getByLabelText("Start"));
    expect(field).toHaveValue("09:00");
    expect(onValue).toHaveBeenLastCalledWith("09:00");
    expect(screen.getByText("AM")).toBeInTheDocument();
  });

  it("shows PM for hours of 12 and above", () => {
    render(<Harness />);
    type(screen.getByLabelText("Start"), "1430");
    fireEvent.blur(screen.getByLabelText("Start"));
    expect(screen.getByLabelText("Start")).toHaveValue("14:30");
    expect(screen.getByText("PM")).toBeInTheDocument();
  });

  it("reports a full time as soon as it is typed, without waiting for blur", () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    type(screen.getByLabelText("Start"), "0930");
    expect(onValue).toHaveBeenLastCalledWith("09:30");
  });

  it("puts back the last good time when what was typed is not a time", () => {
    render(<Harness initial="08:15" />);
    const field = screen.getByLabelText("Start");
    type(field, "99");
    fireEvent.blur(screen.getByLabelText("Start"));
    expect(field).toHaveValue("08:15");
  });

  it("clears the value when the field is emptied", () => {
    const onValue = vi.fn();
    render(<Harness initial="08:15" onValue={onValue} />);
    type(screen.getByLabelText("Start"), "");
    fireEvent.blur(screen.getByLabelText("Start"));
    expect(onValue).toHaveBeenLastCalledWith("");
    expect(screen.getByLabelText("Start")).toHaveValue("");
  });

  it("follows the value when the form resets it", () => {
    const { rerender } = render(<TimeInput aria-label="Start" value="10:00" onChange={vi.fn()} />);
    expect(screen.getByLabelText("Start")).toHaveValue("10:00");
    rerender(<TimeInput aria-label="Start" value="" onChange={vi.fn()} />);
    expect(screen.getByLabelText("Start")).toHaveValue("");
    fireEvent.blur(screen.getByLabelText("Start"));
  });

  it("auto-separates 2100 into 21:00 and shows PM without premature AM while typing 210", () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    const field = screen.getByLabelText("Start");

    type(field, "2");
    expect(field).toHaveValue("2");
    expect(onValue).not.toHaveBeenCalled();

    type(field, "21");
    expect(field).toHaveValue("21");
    expect(onValue).not.toHaveBeenCalled();

    type(field, "210");
    expect(field).toHaveValue("21:0");
    // Not complete yet — should not prematurely report 02:10 AM
    expect(onValue).not.toHaveBeenCalled();
    expect(screen.queryByText("AM")).toBeNull();

    type(field, "2100");
    expect(field).toHaveValue("21:00");
    expect(onValue).toHaveBeenLastCalledWith("21:00");
    expect(screen.getByText("PM")).toBeInTheDocument();
  });

  it("auto-separates 900 into 9:00 and shows AM", () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    const field = screen.getByLabelText("Start");

    type(field, "900");
    expect(field).toHaveValue("9:00");
    expect(onValue).toHaveBeenLastCalledWith("09:00");
    expect(screen.getByText("AM")).toBeInTheDocument();

    fireEvent.blur(field);
    expect(field).toHaveValue("09:00");
  });
});
