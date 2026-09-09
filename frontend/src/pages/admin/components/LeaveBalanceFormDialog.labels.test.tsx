import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LeaveBalanceFormDialog } from "./LeaveBalanceFormDialog";

const form = {
  user: "",
  leave_type: "vacation",
  year: "2026",
  total_days: "22",
  used_days: "0",
  is_carry_over: false,
  expires_at: "",
  accrual_start_date: "",
};

const renderDialog = () =>
  render(
    <LeaveBalanceFormDialog
      open
      onOpenChange={vi.fn()}
      form={form}
      formErrors={{}}
      users={[]}
      isSubmitting={false}
      onSubmit={(e) => e.preventDefault()}
      onFormChange={vi.fn()}
      onFormErrorsChange={vi.fn()}
    />
  );

// Mechanical pass: every label is associated with its control.
describe("LeaveBalanceFormDialog labels", () => {
  it("labels resolve to their inputs", () => {
    renderDialog();
    expect(screen.getByLabelText("Year")).toBeInTheDocument();
    expect(screen.getByLabelText("Total Days")).toBeInTheDocument();
    expect(screen.getByLabelText("Used Days")).toBeInTheDocument();
    const dlg = document.querySelector("[role='dialog']") as HTMLElement;
    for (const label of [...dlg.querySelectorAll("label")]) {
      const target = label.getAttribute("for");
      expect(target, `label "${label.textContent}" has a for attribute`).toBeTruthy();
      expect(
        dlg.querySelector(`#${CSS.escape(target!)}`),
        `label "${label.textContent}" resolves to #${target}`
      ).not.toBeNull();
    }
  });
});
