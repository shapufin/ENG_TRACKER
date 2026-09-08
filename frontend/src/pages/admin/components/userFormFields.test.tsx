import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FormRoleCheckboxes, FormInputField } from "./userFormFields";

describe("FormRoleCheckboxes", () => {
  it("renders HR, IT TL, AL TL, and CR Admin as accessible switches", () => {
    const onChange = vi.fn();
    render(
      <FormRoleCheckboxes
        is_hr_user={false}
        is_italian_tl_role={false}
        is_albanian_tl_role={false}
        is_cr_admin={false}
        prefix="edit"
        onChange={onChange}
      />
    );
    expect(screen.getByRole("switch", { name: /HR/i })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /IT TL/i })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /AL TL/i })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /CR Admin/i })).toBeInTheDocument();
  });

  it("reflects is_cr_admin=true as checked", () => {
    render(
      <FormRoleCheckboxes
        is_hr_user={false}
        is_italian_tl_role={false}
        is_albanian_tl_role={false}
        is_cr_admin={true}
        prefix="edit"
        onChange={vi.fn()}
      />
    );
    const crToggle = screen.getByRole("switch", { name: /CR Admin/i });
    expect(crToggle).toBeChecked();
  });

  it("calls onChange with is_cr_admin=true when CR Admin switch toggled on (payload unchanged)", () => {
    const onChange = vi.fn();
    render(
      <FormRoleCheckboxes
        is_hr_user={false}
        is_italian_tl_role={false}
        is_albanian_tl_role={false}
        is_cr_admin={false}
        prefix="create"
        onChange={onChange}
      />
    );
    const crToggle = screen.getByRole("switch", { name: /CR Admin/i });
    fireEvent.click(crToggle);
    expect(onChange).toHaveBeenCalledWith("is_cr_admin", true);
  });

  it("defaults is_cr_admin to false when prop omitted (backward compat)", () => {
    render(
      <FormRoleCheckboxes
        is_hr_user={false}
        is_italian_tl_role={false}
        is_albanian_tl_role={false}
        prefix="edit"
        onChange={vi.fn()}
      />
    );
    const crToggle = screen.getByRole("switch", { name: /CR Admin/i });
    expect(crToggle).not.toBeChecked();
  });
});

describe("FormInputField", () => {
  it("associates the label with its input", () => {
    // Audit 2026-09-07: shared field rendered <Label> without htmlFor and an
    // input without id — no programmatic accessible name.
    render(<FormInputField label="First Name" value="Alice" onChange={vi.fn()} />);
    expect(screen.getByLabelText("First Name")).toBeInTheDocument();
  });
});
