import React, { useState } from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModalSection } from "@/components/ui/ModalSection";
import { OptionPills } from "@/components/ui/OptionPills";
import { InfoCallout } from "@/components/ui/InfoCallout";
import { FormInputField } from "./userFormFields";
import { UserFormCore } from "./UserFormCore";
import { TeamMultiSelect } from "@/components/admin/TeamMultiSelect";
import { useCreateCRUser } from "@/plugins/control_room/hooks/useControlRoomAccess";
import { AlertCircle } from "lucide-react";
import type { Tech, Team } from "@/types";

interface CreateForm {
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  password: string;
  phone: string;
  teams: number[];
  techs: number[];
  albanian_tl: string;
  italian_tl: string;
  is_hr_user: boolean;
  is_italian_tl_role: boolean;
  is_albanian_tl_role: boolean;
  is_cr_admin: boolean;
  roles: string[];
}

interface UserCreateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: CreateForm;
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
  onFormChange: (form: CreateForm) => void;
  onFormErrorsChange: (errors: Record<string, string>) => void;
}

type UserType = "standard" | "cr";

export const UserCreateFormDialog: React.FC<UserCreateFormDialogProps> = ({
  open,
  onOpenChange,
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
  const [userType, setUserType] = useState<UserType>("standard");
  const [crTeamIds, setCrTeamIds] = useState<number[]>([]);
  const [crError, setCrError] = useState<string>("");
  const createCRUserMut = useCreateCRUser();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateField = (key: string, value: any) => {
    onFormChange({ ...form, [key]: value });
    if (formErrors[key]) {
      const n = { ...formErrors };
      delete n[key];
      onFormErrorsChange(n);
    }
  };

  const resetCRState = () => {
    setCrTeamIds([]);
    setCrError("");
    setUserType("standard");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetCRState();
    onOpenChange(next);
  };

  const handleCRSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createCRUserMut.mutate(
      {
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        team_ids: crTeamIds,
      },
      {
        onSuccess: () => {
          onFormChange({ ...form, username: "", email: "", password: "" });
          resetCRState();
          onOpenChange(false);
        },
        onError: (err: unknown) => {
          const anyErr = err as { response?: { data?: { error?: string } } };
          const msg = anyErr?.response?.data?.error;
          setCrError(msg || "Failed to create Control Room user.");
        },
      }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    if (userType === "cr") {
      handleCRSubmit(e);
    } else {
      onSubmit(e);
    }
  };

  const teams = (teamsData || []) as unknown as Team[];
  const submitting = userType === "cr" ? createCRUserMut.isPending : isSubmitting;

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Create User"
      description="Create a standard account or a control-room-only user."
      onSubmit={handleSubmit}
      isSubmitting={submitting}
      submitLabel={userType === "cr" ? "Create & Grant CR Access" : undefined}
    >
      {/* User Type — only shown for full admins (CR admins use CreateCRUserDialog directly) */}
      <OptionPills
        label="Account type"
        columns={2}
        value={userType}
        onChange={setUserType}
        options={[
          { value: "standard", label: "Standard User" },
          { value: "cr", label: "CR User" },
        ]}
      />

      {userType === "cr" && crError && (
        <InfoCallout tone="danger" label={crError} icon={<AlertCircle className="h-4 w-4" />} />
      )}

      <ModalSection title="Account" columns={2}>
        <FormInputField
          label="Username"
          value={form.username}
          onChange={(v) => updateField("username", v)}
          error={formErrors.username}
        />
        <FormInputField
          label="Email"
          value={form.email}
          onChange={(v) => updateField("email", v)}
          error={formErrors.email}
          type="email"
        />
        <div className="space-y-2">
          <Label htmlFor="user-create-first-name">First Name</Label>
          <Input
            id="user-create-first-name"
            value={form.first_name}
            onChange={(e) => updateField("first_name", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="user-create-last-name">Last Name</Label>
          <Input
            id="user-create-last-name"
            value={form.last_name}
            onChange={(e) => updateField("last_name", e.target.value)}
          />
        </div>
        <FormInputField
          label="Password"
          value={form.password}
          onChange={(v) => updateField("password", v)}
          error={formErrors.password}
          type="password"
        />
      </ModalSection>

      {userType === "standard" ? (
        <UserFormCore
          form={form}
          updateField={updateField}
          prefix="c"
          teamsData={teamsData}
          techsData={techsData}
          albanianTLs={albanianTLs}
          italianTLs={italianTLs}
        />
      ) : (
        <div className="space-y-2" role="group" aria-labelledby="user-create-scopes-label">
          <Label id="user-create-scopes-label">Team Scopes</Label>
          <TeamMultiSelect teams={teams} value={crTeamIds} onChange={setCrTeamIds} />
          <p className="text-xs text-muted-foreground">
            Empty scope means no visibility (not global). Admin/staff always have global access.
          </p>
        </div>
      )}
    </FormDialog>
  );
};
