import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LeaveRequestForm } from "./LeaveRequestForm";

const baseForm = {
  request_type: "vacation" as const,
  start_date: "",
  end_date: "",
  reason: "",
};

describe("LeaveRequestForm half day", () => {
  it("picking a half day sets the period and ends on the start date", () => {
    const onChange = vi.fn();
    const form = { ...baseForm, start_date: "2026-03-09", end_date: "2026-03-11" };
    render(<LeaveRequestForm formData={form} formErrors={{}} onChange={onChange} />);

    fireEvent.click(screen.getByRole("radio", { name: /morning/i }));

    expect(onChange).toHaveBeenCalledWith({
      ...form,
      is_half_day: true,
      half_day_period: "morning",
      end_date: "2026-03-09",
    });
  });

  it("hides the end date and states the deduction while a half day is chosen", () => {
    const form = { ...baseForm, start_date: "2026-03-09", end_date: "2026-03-09", is_half_day: true, half_day_period: "afternoon" as const };
    render(<LeaveRequestForm formData={form} formErrors={{}} onChange={vi.fn()} />);

    expect(screen.queryByText("End date")).not.toBeInTheDocument();
    expect(screen.getByText(/deducts 0\.5 days/i)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /afternoon/i })).toBeChecked();
  });

  it("has no duration choice for sick leave", () => {
    render(<LeaveRequestForm formData={{ ...baseForm, request_type: "sick" }} formErrors={{}} onChange={vi.fn()} />);
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });
});

describe("LeaveRequestForm", () => {
  it("edits the reason through the shared textarea", () => {
    const onChange = vi.fn();
    render(<LeaveRequestForm formData={baseForm} formErrors={{}} onChange={onChange} />);

    const textarea = screen.getByPlaceholderText("Optional reason...");
    fireEvent.change(textarea, { target: { value: "family reasons" } });

    expect(onChange).toHaveBeenCalledWith({ ...baseForm, reason: "family reasons" });
  });

  it("updates the request type via the pills", () => {
    const onChange = vi.fn();
    render(<LeaveRequestForm formData={baseForm} formErrors={{}} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Sick Leave" }));

    expect(onChange).toHaveBeenCalledWith({ ...baseForm, request_type: "sick" });
  });
});
