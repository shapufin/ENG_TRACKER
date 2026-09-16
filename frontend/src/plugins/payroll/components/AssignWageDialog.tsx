/**
 * AssignWageDialog — create/edit a wage assignment for one employee.
 * Extracted from PayrollWagesPage so the modal has room to breathe (was
 * size="sm"/448px for a 5-field form) and uses the shared ModalSection
 * grouping + the unified DateRangePicker for the effective period.
 */
import React from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { ModalSection } from "@/components/ui/ModalSection";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import type { EligibleUser } from "../types";

export interface AssignWageForm {
  user: string;
  gross_monthly_wage: string;
  effective_from: string;
  effective_to: string;
  note: string;
}

interface AssignWageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  form: AssignWageForm;
  onFormChange: (form: AssignWageForm) => void;
  formUser?: EligibleUser;
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting: boolean;
  submitDisabled: boolean;
}

export const AssignWageDialog: React.FC<AssignWageDialogProps> = ({
  open,
  onOpenChange,
  mode,
  form,
  onFormChange,
  formUser,
  onSubmit,
  isSubmitting,
  submitDisabled,
}) => (
  <FormDialog
    open={open}
    onOpenChange={onOpenChange}
    title={mode === "edit" ? "Edit Wage Assignment" : "Assign Wage"}
    description="Set the authoritative base monthly salary for payroll runs."
    onSubmit={onSubmit}
    isSubmitting={isSubmitting}
    submitLabel={mode === "edit" ? "Update" : "Assign Wage"}
    submitDisabled={submitDisabled}
    size="md"
  >
    <ModalSection title="Employee" columns={1}>
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/30 px-3 py-2 text-sm">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-bold text-primary-foreground"
        >
          {(formUser?.full_name ?? form.user)
            .split(" ")
            .map((w) => w[0])
            .join("")}
        </span>
        <div>
          <div className="text-xs font-bold">{formUser?.full_name ?? form.user}</div>
          {formUser && (
            <div className="font-mono text-[10px] text-muted-foreground">@{formUser.username}</div>
          )}
        </div>
      </div>
    </ModalSection>

    <ModalSection title="Wage" columns={1}>
      <div>
        <Label htmlFor="wage">Gross Monthly Wage (Lek)</Label>
        <div className="relative mt-1">
          <Input
            id="wage"
            type="number"
            value={form.gross_monthly_wage}
            onChange={(e) => onFormChange({ ...form, gross_monthly_wage: e.target.value })}
            placeholder="e.g. 100000"
            className="pr-20"
          />
          <span
            aria-hidden="true"
            className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-primary"
          >
            Lek / mo
          </span>
        </div>
      </div>
    </ModalSection>

    <ModalSection
      title="Effective period"
      description="Optional — leave blank to start today with no end date."
      columns={1}
    >
      <div>
        <Label htmlFor="effective-period">Effective period</Label>
        <div className="mt-1">
          <DateRangePicker
            id="effective-period"
            ariaLabel="Effective period"
            from={form.effective_from}
            to={form.effective_to}
            onChange={({ from, to }) =>
              onFormChange({ ...form, effective_from: from, effective_to: to })
            }
          />
        </div>
      </div>
    </ModalSection>

    <ModalSection title="Note" columns={1}>
      <div>
        <Label htmlFor="note">Note (optional)</Label>
        <Input
          id="note"
          value={form.note}
          onChange={(e) => onFormChange({ ...form, note: e.target.value })}
        />
      </div>
    </ModalSection>
  </FormDialog>
);
