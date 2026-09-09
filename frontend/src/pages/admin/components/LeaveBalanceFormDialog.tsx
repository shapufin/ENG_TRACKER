import React from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { Input } from "@/components/ui/input";
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
          <Label
            htmlFor="leave-balance-user"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            User
          </Label>
          <Select value={form.user} onValueChange={(v) => updateField("user", v)}>
            <SelectTrigger
              id="leave-balance-user"
              className={cn("h-10 px-3", formErrors.user ? "border-destructive" : "")}
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
          {formErrors.user && <p className="text-xs text-destructive">{formErrors.user}</p>}
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="leave-balance-type"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Leave Type
          </Label>
          <Select value={form.leave_type} onValueChange={(v) => updateField("leave_type", v)}>
            <SelectTrigger
              id="leave-balance-type"
              className={cn("h-10 px-3", formErrors.leave_type ? "border-destructive" : "")}
            >
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vacation">Vacation</SelectItem>
            </SelectContent>
          </Select>
          {formErrors.leave_type && (
            <p className="text-xs text-destructive">{formErrors.leave_type}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="leave-balance-year">Year</Label>
          <Input
            id="leave-balance-year"
            type="number"
            value={form.year}
            onChange={(e) => updateField("year", e.target.value)}
            required
            className={formErrors.year ? "border-destructive" : ""}
          />
          {formErrors.year && <p className="text-xs text-destructive">{formErrors.year}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="leave-balance-total">Total Days</Label>
          <Input
            id="leave-balance-total"
            type="number"
            value={form.total_days}
            onChange={(e) => updateField("total_days", e.target.value)}
            required
            className={formErrors.total_days ? "border-destructive" : ""}
          />
          {formErrors.total_days && (
            <p className="text-xs text-destructive">{formErrors.total_days}</p>
          )}
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Label htmlFor="leave-balance-used">Used Days</Label>
        <Input
          id="leave-balance-used"
          type="number"
          value={form.used_days}
          onChange={(e) => updateField("used_days", e.target.value)}
          required
          className={formErrors.used_days ? "border-destructive" : ""}
        />
        {formErrors.used_days && <p className="text-xs text-destructive">{formErrors.used_days}</p>}
      </div>
      {formErrors.non_field_errors && (
        <p className="text-xs text-destructive">{formErrors.non_field_errors}</p>
      )}
    </FormDialog>
  );
};
