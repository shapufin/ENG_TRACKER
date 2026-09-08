/**
 * EditCRUserDialog — simplified edit form for CR admins.
 *
 * Shows only CR-relevant fields: first_name, last_name, email, phone,
 * team scopes (multi-select), and is_active toggle. No TL/HR/role fields.
 * Calls the `update_cr_user` endpoint which updates basic user info +
 * CR access + team scopes in one atomic transaction.
 *
 * The parent must pass a `key` that changes when the target user changes
 * so this component remounts with fresh initial state.
 */
import React, { useState } from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FormErrorBanner } from "@/components/common/forms/FormErrorBanner";
import { useFormFieldUpdater } from "@/components/common/forms/useFormFieldUpdater";
import { extractApiErrorMessage } from "@/lib/apiFormError";
import { useUpdateCRUser } from "../hooks/useControlRoomAccess";
import { TeamMultiSelect } from "./TeamMultiSelect";
import type { ControlRoomAccess } from "../types";
import type { Team } from "@/types";

interface EditCRUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The CR access record for the user being edited (null if not yet loaded). */
  access: ControlRoomAccess | null;
  /** The user's display name for the dialog title. */
  username: string;
  teams: Team[];
}

interface EditForm {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  team_ids: number[];
  is_active: boolean;
}

export const EditCRUserDialog: React.FC<EditCRUserDialogProps> = ({
  open,
  onOpenChange,
  access,
  username,
  teams,
}) => {
  const [form, setForm] = useState<EditForm>(() => ({
    first_name: access?.first_name || "",
    last_name: access?.last_name || "",
    email: access?.email || "",
    phone: access?.phone || "",
    team_ids: access?.team_ids || [],
    is_active: access?.is_active ?? true,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const updateMut = useUpdateCRUser();

  const updateField = useFormFieldUpdater(form, errors, setForm, setErrors);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!access) return;
    updateMut.mutate(
      {
        user_id: access.user,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone,
        team_ids: form.team_ids,
        is_active: form.is_active,
      },
      {
        onSuccess: () => {
          setErrors({});
          onOpenChange(false);
        },
        onError: (err: unknown) => {
          setErrors({
            form: extractApiErrorMessage(err, "Failed to update Control Room user."),
          });
        },
      }
    );
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setErrors({});
    }
    onOpenChange(next);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={username ? `Edit ${username}` : "Edit CR User"}
      onSubmit={handleSubmit}
      isSubmitting={updateMut.isPending}
      submitLabel="Save Changes"
    >
      <FormErrorBanner message={errors.form} />

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="cr-edit-first">First Name</Label>
          <Input
            id="cr-edit-first"
            value={form.first_name}
            onChange={(e) => updateField("first_name", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cr-edit-last">Last Name</Label>
          <Input
            id="cr-edit-last"
            value={form.last_name}
            onChange={(e) => updateField("last_name", e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cr-edit-email">Email</Label>
        <Input
          id="cr-edit-email"
          type="email"
          value={form.email}
          onChange={(e) => updateField("email", e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cr-edit-phone">Phone</Label>
        <Input
          id="cr-edit-phone"
          value={form.phone}
          onChange={(e) => updateField("phone", e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Team Scopes</Label>
        <TeamMultiSelect
          teams={teams}
          value={form.team_ids}
          onChange={(ids) => updateField("team_ids", ids)}
        />
        <p className="text-xs text-muted-foreground">
          Empty scope means no visibility (not global). Admin/staff always have global access.
        </p>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Checkbox
          id="cr-edit-active"
          checked={form.is_active}
          onCheckedChange={(v) => updateField("is_active", !!v)}
        />
        <Label htmlFor="cr-edit-active" className="text-sm">
          Active (CR access enabled)
        </Label>
      </div>
    </FormDialog>
  );
};
