import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PayrollRuleSetEditorDialog } from "./PayrollRuleSetEditorDialog";
import { payrollService } from "../services/payrollService";
import type { PayrollRuleSet } from "../types";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

vi.mock("../services/payrollService", () => ({
  payrollService: {
    saveRuleSet: vi.fn(),
  },
}));

const source: PayrollRuleSet = {
  id: 1,
  code: "AL_2026",
  name: "Albania 2026",
  version: "1.0",
  country: "AL",
  effective_from: "2026-01-01",
  effective_to: null,
  is_active: true,
  tax_profile: "standard",
  source: "Reference",
  notes: "",
  validation_status: "reference",
  has_payroll_runs: false,
  effective_status: "current",
  tax_brackets: [
    {
      id: 10,
      rule_set: 1,
      lower_bound: "0",
      upper_bound: null,
      rate: "0.13",
      fixed_amount: "0",
      order: 0,
    },
  ],
  contribution_rates: [
    {
      id: 20,
      rule_set: 1,
      contribution_type: "health",
      side: "employee",
      rate: "0.095",
      cap: null,
      floor: null,
    },
  ],
  overtime_categories: [
    {
      id: 30,
      rule_set: 1,
      code: "weekday_day",
      multiplier: "1.25",
      night_start_hour: null,
      night_end_hour: null,
      applies_weekend: false,
      applies_holiday: false,
      order: 0,
    },
  ],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("PayrollRuleSetEditorDialog", () => {
  it("shows readable percentage labels and converts values before saving", async () => {
    vi.mocked(payrollService.saveRuleSet).mockResolvedValue(source);
    const onSaved = vi.fn();
    render(
      <PayrollRuleSetEditorDialog
        open
        onOpenChange={vi.fn()}
        source={source}
        mode="edit"
        onSaved={onSaved}
      />
    );

    expect(screen.getByText("Income Tax Brackets")).toBeInTheDocument();
    expect(screen.getByText("Social Security & Health Insurance")).toBeInTheDocument();
    expect(screen.getByDisplayValue("13")).toBeInTheDocument();
    expect(screen.getByDisplayValue("9.5")).toBeInTheDocument();
    expect(screen.getByDisplayValue("125")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save calculation" }));

    await waitFor(() => expect(payrollService.saveRuleSet).toHaveBeenCalled());
    const payload = vi.mocked(payrollService.saveRuleSet).mock.calls[0][1];
    expect(payload.mode).toBe("edit");
    expect(payload.tax_brackets[0].rate).toBe("0.13");
    expect(payload.contribution_rates[0].rate).toBe("0.095");
    expect(payload.overtime_categories[0].multiplier).toBe("1.25");
    expect(onSaved).toHaveBeenCalled();
  });

  it("requires new identity fields when creating a version", async () => {
    vi.clearAllMocks();
    render(
      <PayrollRuleSetEditorDialog
        open
        onOpenChange={vi.fn()}
        source={source}
        mode="version"
        onSaved={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Short Code (unique ID)")).toHaveValue("");
    expect(screen.getByLabelText("Version")).toHaveValue("");
    expect(screen.getByLabelText("Effective from")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Create version" }));
    expect(
      screen.getByText("Name, code, version, and effective date are required.")
    ).toBeInTheDocument();
    expect(payrollService.saveRuleSet).not.toHaveBeenCalled();
  });

  it("allows adding and removing child rows", () => {
    render(
      <PayrollRuleSetEditorDialog
        open
        onOpenChange={vi.fn()}
        source={source}
        mode="edit"
        onSaved={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Add bracket" }));
    expect(screen.getByLabelText("Tax bracket 2 lower income")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove tax bracket 2" }));
    expect(screen.queryByLabelText("Tax bracket 2 lower income")).not.toBeInTheDocument();
  });
});
