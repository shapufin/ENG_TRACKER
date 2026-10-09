import React from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { FormField } from "@/components/ui/FormField";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface LeaveBalanceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingName?: string | null;
  form: {
    user: string;
    leave_type: string;
    year: string;
    total_days: string;
    used_days: string;
    is_carry_over: boolean;
    expires_at: string;
    accrual_start_date: string;
  };
  formErrors: Record<string, string>;
  users?: { id: number; first_name?: string; last_name?: string; username: string }[];
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onFormChange: (form: {
    user: string;
    leave_type: string;
    year: string;
    total_days: string;
    used_days: string;
    is_carry_over: boolean;
    expires_at: string;
    accrual_start_date: string;
  }) => void;
  onFormErrorsChange: (errors: Record<string, string>) => void;
}

// fallow-ignore-next-line complexity
export const LeaveBalanceFormDialog: React.FC<LeaveBalanceFormDialogProps> = ({
  open,
  onOpenChange,
  editingName,
  form,
  formErrors,
  users,
  isSubmitting,
  onSubmit,
  onFormChange,
  onFormErrorsChange,
}) => {
  const updateField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    onFormChange({ ...form, [key]: value });
    const nextErrors = { ...formErrors };
    delete nextErrors[key];
    onFormErrorsChange(nextErrors);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingName ? `Edit ${editingName}` : "New Balance"}
      description="Set the yearly vacation allowance and tracked usage for one user."
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="leave-balance-user">User</Label>
          <Select value={form.user} onValueChange={(v) => updateField("user", v)}>
            <SelectTrigger
              id="leave-balance-user"
              aria-invalid={formErrors.user ? true : undefined}
              aria-describedby={formErrors.user ? "leave-balance-user-error" : undefined}
              className={cn(formErrors.user ? "border-destructive" : "")}
            >
              <SelectValue placeholder="Select user" />
            </SelectTrigger>
            <SelectContent>
              {users?.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.first_name} {u.last_name} ({u.username})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {formErrors.user && (
            <p id="leave-balance-user-error" className="text-destructive text-xs">
              {formErrors.user}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="leave-balance-type">Leave Type</Label>
          <Select value={form.leave_type} onValueChange={(v) => updateField("leave_type", v)}>
            <SelectTrigger
              id="leave-balance-type"
              aria-invalid={formErrors.leave_type ? true : undefined}
              aria-describedby={formErrors.leave_type ? "leave-balance-type-error" : undefined}
              className={cn(formErrors.leave_type ? "border-destructive" : "")}
            >
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vacation">Vacation</SelectItem>
            </SelectContent>
          </Select>
          {formErrors.leave_type && (
            <p id="leave-balance-type-error" className="text-destructive text-xs">
              {formErrors.leave_type}
            </p>
          )}
        </div>
        <FormField
          id="leave-balance-year"
          label="Year"
          type="number"
          value={form.year}
          onChange={(v) => updateField("year", v)}
          error={formErrors.year}
          required
        />
        <FormField
          id="leave-balance-total"
          label="Total Days"
          type="number"
          value={form.total_days}
          onChange={(v) => updateField("total_days", v)}
          error={formErrors.total_days}
          required
        />
      </div>
      <FormField
        className="mt-4"
        id="leave-balance-used"
        label="Used Days"
        type="number"
        value={form.used_days}
        onChange={(v) => updateField("used_days", v)}
        error={formErrors.used_days}
        required
      />
      {formErrors.non_field_errors && (
        <p className="text-destructive text-xs" role="alert">
          {formErrors.non_field_errors}
        </p>
      )}
    </FormDialog>
  );
};
