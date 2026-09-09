import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LeaveRequestForm } from "./LeaveRequestForm";

const baseForm = {
  request_type: "vacation" as const,
  start_date: "",
  end_date: "",
  reason: "",
};

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
