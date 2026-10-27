import React from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { ModalSection } from "@/components/ui/ModalSection";

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
    code?: string;
    teams: number[];
    techs: number[];
    albanian_tl: string;
    italian_tl: string;
    is_hr_user: boolean;
    is_italian_tl_role: boolean;
    is_albanian_tl_role: boolean;
    is_hbpr?: boolean;
    mfa_required?: boolean;
    unassign_removed_tl?: boolean;
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

  // Teams the user had when the dialog opened and no longer has in the form.
  const removedTeams = (editing?.teams ?? [])
    .filter((id) => !form.teams.includes(id))
    .map((id) => (teamsData ?? []).find((team) => team.id === id)?.name ?? `#${id}`);
  const hasTlLink = form.italian_tl !== "none" || form.albanian_tl !== "none";

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${editing.user?.username}` : "Edit User"}
      description="Update account details, teams, and roles."
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
    >
      <ModalSection title="Account" columns={2}>
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
        <div className="sm:col-span-2">
          <FormInputField
            label="Email"
            value={form.email}
            onChange={(v) => updateField("email", v)}
            error={formErrors.email}
            type="email"
          />
        </div>
        <FormInputField
          label="Employee Code"
          value={form.code ?? ""}
          onChange={(v) => updateField("code", v)}
          error={formErrors.code}
        />
      </ModalSection>
      <UserFormCore
        form={form}
        updateField={updateField}
        prefix="e"
        teamsData={teamsData}
        techsData={techsData}
        albanianTLs={albanianTLs}
        italianTLs={italianTLs}
        showHireDate
        showMfa
      />
      {removedTeams.length > 0 && hasTlLink && (
        <label className="border-line-subtle flex items-start gap-2 rounded-md border p-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={Boolean(form.unassign_removed_tl)}
            onChange={(event) => updateField("unassign_removed_tl", event.target.checked)}
          />
          <span>
            Also clear the Italian/Albanian TL link that came with the removed team
            {removedTeams.length === 1 ? "" : "s"} ({removedTeams.join(", ")}). Leaving it in place
            keeps that leader's access to this user.
          </span>
        </label>
      )}
      {formErrors.non_field_errors && (
        <p className="text-destructive text-xs">{formErrors.non_field_errors}</p>
      )}
    </FormDialog>
  );
};
