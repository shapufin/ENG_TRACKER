import type React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AssignWageDialog, type AssignWageForm } from "./AssignWageDialog";

const emptyForm: AssignWageForm = {
  user: "3",
  gross_monthly_wage: "",
  effective_from: "",
  effective_to: "",
  note: "",
};

const renderDialog = (overrides: Partial<React.ComponentProps<typeof AssignWageDialog>> = {}) =>
  render(
    <AssignWageDialog
      open
      onOpenChange={vi.fn()}
      mode="create"
      form={emptyForm}
      onFormChange={vi.fn()}
      formUser={{ id: 3, username: "asmith", full_name: "Alice Smith" } as never}
      onSubmit={vi.fn()}
      isSubmitting={false}
      submitDisabled={false}
      {...overrides}
    />
  );

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
});

describe("AssignWageDialog", () => {
  it("renders the create title and employee display card", () => {
    renderDialog();
    expect(screen.getByRole("heading", { name: "Assign Wage" })).toBeInTheDocument();
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("@asmith")).toBeInTheDocument();
  });

  it("renders the edit title when in edit mode", () => {
    renderDialog({ mode: "edit" });
    expect(screen.getByRole("heading", { name: "Edit Wage Assignment" })).toBeInTheDocument();
  });

  it("shows the wage input with the Lek suffix", () => {
    renderDialog();
    expect(screen.getByLabelText(/gross monthly wage/i)).toBeInTheDocument();
    expect(screen.getByText("Lek / mo")).toBeInTheDocument();
  });

  it("shows a single effective-period range picker", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Effective period" })).toBeInTheDocument();
  });

  it("calls onFormChange when the wage input changes", () => {
    const onFormChange = vi.fn();
    renderDialog({ onFormChange });
    fireEvent.change(screen.getByLabelText(/gross monthly wage/i), { target: { value: "50000" } });
    expect(onFormChange).toHaveBeenCalledWith(
      expect.objectContaining({ gross_monthly_wage: "50000" })
    );
  });

  it("disables the submit button when submitDisabled is true", () => {
    renderDialog({ submitDisabled: true });
    expect(screen.getByRole("button", { name: "Assign Wage" })).toBeDisabled();
  });
});
