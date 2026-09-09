import React from "react";
import { FormDialog } from "@/components/ui/FormDialog";

import { FormInputField } from "./userFormFields";
import { UserFormCore } from "./UserFormCore";
import type { Tech, UserProfile } from "@/types";

interface UserEditFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: UserProfile | null;
  form: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    teams: number[];
    techs: number[];
    albanian_tl: string;
    italian_tl: string;
    is_hr_user: boolean;
    is_italian_tl_role: boolean;
    is_albanian_tl_role: boolean;
    hire_date: string;
  };
  formErrors: Record<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  teamsData: any[];
  techsData: Tech[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  albanianTLs: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  italianTLs: any[];
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onFormChange: (form: any) => void;
  onFormErrorsChange: (errors: Record<string, string>) => void;
}

export const UserEditFormDialog: React.FC<UserEditFormDialogProps> = ({
  open,
  onOpenChange,
  editing,
  form,
  formErrors,
  teamsData,
  techsData,
  albanianTLs,
  italianTLs,
  isSubmitting,
  onSubmit,
  onFormChange,
  onFormErrorsChange,
}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateField = (key: string, value: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onFormChange((prev: any) => ({ ...prev, [key]: value }));
    if (formErrors[key]) {
      const n = { ...formErrors };
      delete n[key];
      onFormErrorsChange(n);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${editing.user?.username}` : "Edit User"}
      description="Update account details, teams, and roles."
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
    >
      <div className="grid grid-cols-2 gap-3">
        <FormInputField
          label="First Name"
          value={form.first_name}
          onChange={(v) => updateField("first_name", v)}
          error={formErrors.first_name}
        />
        <FormInputField
          label="Last Name"
          value={form.last_name}
          onChange={(v) => updateField("last_name", v)}
          error={formErrors.last_name}
        />
      </div>
      <FormInputField
        label="Email"
        value={form.email}
        onChange={(v) => updateField("email", v)}
        error={formErrors.email}
        type="email"
      />
      <UserFormCore
        form={form}
        updateField={updateField}
        prefix="e"
        teamsData={teamsData}
        techsData={techsData}
        albanianTLs={albanianTLs}
        italianTLs={italianTLs}
        showHireDate
      />
      {formErrors.non_field_errors && (
        <p className="text-xs text-destructive">{formErrors.non_field_errors}</p>
      )}
    </FormDialog>
  );
};
