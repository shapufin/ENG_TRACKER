import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LeaveDurationPicker } from "./LeaveDurationPicker";
import { durationFields, durationOf } from "./leaveDuration";

describe("LeaveDurationPicker", () => {
  it("marks the current duration as the one checked radio", () => {
    render(<LeaveDurationPicker value="afternoon" onChange={() => {}} />);

    expect(screen.getByRole("radiogroup", { name: "Duration" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /afternoon/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /morning/i })).not.toBeChecked();
  });

  it("reports the chosen duration", () => {
    const onChange = vi.fn();
    render(<LeaveDurationPicker value="full" onChange={onChange} />);

    fireEvent.click(screen.getByRole("radio", { name: /morning/i }));

    expect(onChange).toHaveBeenCalledWith("morning");
  });

  it("moves with the arrow keys and wraps around", () => {
    const onChange = vi.fn();
    render(<LeaveDurationPicker value="full" onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole("radio", { name: /full/i }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("morning");

    fireEvent.keyDown(screen.getByRole("radio", { name: /full/i }), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("afternoon");
  });

  it("only the checked radio is in the tab order", () => {
    render(<LeaveDurationPicker value="morning" onChange={() => {}} />);

    expect(screen.getByRole("radio", { name: /morning/i })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: /full/i })).toHaveAttribute("tabindex", "-1");
  });

  it("maps to and from request fields", () => {
    expect(durationFields("full")).toEqual({ is_half_day: false, half_day_period: null });
    expect(durationFields("afternoon")).toEqual({
      is_half_day: true,
      half_day_period: "afternoon",
    });
    expect(durationOf(true, "morning")).toBe("morning");
    expect(durationOf(false, null)).toBe("full");
    expect(durationOf(undefined, undefined)).toBe("full");
  });
});
