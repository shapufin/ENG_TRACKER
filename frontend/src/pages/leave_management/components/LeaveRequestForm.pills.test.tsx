import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LeaveRequestForm } from "./LeaveRequestForm";

const baseForm = {
  request_type: "vacation" as const,
  start_date: "",
  end_date: "",
  reason: "",
};

describe("LeaveRequestForm pills + allowance banner (mockup RequestTimeOff pattern)", () => {
  it("renders exactly two type pills in a labelled group", () => {
    render(<LeaveRequestForm formData={baseForm} formErrors={{}} onChange={vi.fn()} />);
    const group = screen.getByRole("group", { name: "Request type" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /vacation/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sick/i })).toBeInTheDocument();
  });

  it("exposes selection via aria-pressed and switches type on click", () => {
    const onChange = vi.fn();
    render(<LeaveRequestForm formData={baseForm} formErrors={{}} onChange={onChange} />);
    expect(screen.getByRole("button", { name: /vacation/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: /sick/i })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: /sick/i }));
    expect(onChange).toHaveBeenCalledWith({ ...baseForm, request_type: "sick" });
  });

  it("still shows the request-type validation error", () => {
    render(
      <LeaveRequestForm
        formData={baseForm}
        formErrors={{ request_type: "Request type is required" }}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText("Request type is required")).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Request type" });
    expect(group).toHaveAttribute("aria-invalid", "true");
  });

  it("shows the allowance banner with the real remaining value", () => {
    render(
      <LeaveRequestForm formData={baseForm} formErrors={{}} onChange={vi.fn()} remainingDays={16} />
    );
    const banner = screen.getByRole("status", { name: /allowance remaining/i });
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent("16");
  });

  it("hides the banner when no balance is available", () => {
    render(<LeaveRequestForm formData={baseForm} formErrors={{}} onChange={vi.fn()} />);
    expect(screen.queryByRole("status", { name: /allowance remaining/i })).not.toBeInTheDocument();
  });
});
