/**
 * CreateCRUserDialog — one-step "Create CR User" form.
 *
 * Creates a normal Django user AND grants them Control Room access with the
 * selected team scopes in one atomic backend transaction. Uses the minimal
 * field set: username, basic info, email, password, team multi-select.
 *
 * The created user is a normal user (no schema flag). Only the access +
 * scope rows are plugin-owned and removable with the plugin.
 */
import React, { useState } from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormErrorBanner } from "@/components/common/forms/FormErrorBanner";
import { useFormFieldUpdater } from "@/components/common/forms/useFormFieldUpdater";
import { extractApiErrorMessage } from "@/lib/apiFormError";
import { useCreateCRUser } from "../hooks/useControlRoomAccess";
import { TeamMultiSelect } from "./TeamMultiSelect";
import type { Team } from "@/types";

interface CreateCRUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams: Team[];
}

interface CreateForm {
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  team_ids: number[];
}

const emptyForm: CreateForm = {
  username: "",
  first_name: "",
  last_name: "",
  email: "",
  password: "",
  team_ids: [],
};

export const CreateCRUserDialog: React.FC<CreateCRUserDialogProps> = ({
  open,
  onOpenChange,
  teams,
}) => {
  const [form, setForm] = useState<CreateForm>({ ...emptyForm });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const createMut = useCreateCRUser();

  const updateField = useFormFieldUpdater(form, errors, setForm, setErrors);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.username.trim()) e.username = "Username is required.";
    else if (form.username.trim().length < 3)
      e.username = "Username must be at least 3 characters.";
    if (!form.email.trim()) e.email = "Email is required.";
    if (!form.password) e.password = "Password is required.";
    else if (form.password.length < 6) e.password = "Password must be at least 6 characters.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    createMut.mutate(
      {
        username: form.username.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        password: form.password,
        team_ids: form.team_ids,
      },
      {
        onSuccess: () => {
          setForm({ ...emptyForm });
          setErrors({});
          onOpenChange(false);
        },
        onError: (err: unknown) => {
          // Backend returns { error: string } on validation failure.
          setErrors({
            form: extractApiErrorMessage(err, "Failed to create Control Room user."),
          });
        },
      }
    );
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setForm({ ...emptyForm });
      setErrors({});
    }
    onOpenChange(next);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Create Control Room User"
      description="Create the access record that gives a user control-room visibility."
      onSubmit={handleSubmit}
      isSubmitting={createMut.isPending}
      submitLabel="Create & Grant Access"
    >
      <FormErrorBanner message={errors.form} />

      <div className="space-y-2">
        <Label htmlFor="cr-create-username">Username</Label>
        <Input
          id="cr-create-username"
          value={form.username}
          onChange={(e) => updateField("username", e.target.value)}
          autoComplete="off"
        />
        {errors.username && <p className="text-xs text-destructive">{errors.username}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="cr-create-first-name">First Name</Label>
          <Input
            id="cr-create-first-name"
            value={form.first_name}
            onChange={(e) => updateField("first_name", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cr-create-last-name">Last Name</Label>
          <Input
            id="cr-create-last-name"
            value={form.last_name}
            onChange={(e) => updateField("last_name", e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cr-create-email">Email</Label>
        <Input
          id="cr-create-email"
          type="email"
          value={form.email}
          onChange={(e) => updateField("email", e.target.value)}
          autoComplete="off"
        />
        {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="cr-create-password">Password</Label>
        <Input
          id="cr-create-password"
          type="password"
          value={form.password}
          onChange={(e) => updateField("password", e.target.value)}
          autoComplete="new-password"
        />
        {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
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
    </FormDialog>
  );
};
