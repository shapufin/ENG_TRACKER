import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FormDialog } from "@/components/ui/FormDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModalSection } from "@/components/ui/ModalSection";
import { OptionPills } from "@/components/ui/OptionPills";
import { InfoCallout } from "@/components/ui/InfoCallout";
import { FormInputField } from "./userFormFields";
import { UserFormCore } from "./UserFormCore";
import { TeamMultiSelect } from "@/components/admin/TeamMultiSelect";
import { AlertCircle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GeneratedPasswordField } from "./GeneratedPasswordField";
import type { Tech, Team } from "@/types";

interface CreateForm {
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  password: string;
  phone: string;
  code?: string;
  teams: number[];
  techs: number[];
  albanian_tl: string;
  italian_tl: string;
  is_hr_user: boolean;
  is_italian_tl_role: boolean;
  is_albanian_tl_role: boolean;
  is_cr_admin: boolean;
  is_hbpr: boolean;
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

// Server keys that belong to the always-visible account section; any other
// error key lives in the collapsed assignment section and must open it.
const ACCOUNT_ERROR_KEYS = new Set([
  "username",
  "email",
  "password",
  "first_name",
  "last_name",
  "error",
  "messages",
]);

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
  const [crSubmitting, setCrSubmitting] = useState(false);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const queryClient = useQueryClient();

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
    setAssignmentOpen(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetCRState();
    onOpenChange(next);
  };

  // Dynamic import (not the plugin's React Query hook, which must be called
  // unconditionally at top level and so can't be resolved lazily): keeps the
  // control_room plugin's module out of this core component's static
  // import graph so `remove_plugin control_room` can't break the build.
  const handleCRSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCrSubmitting(true);
    setCrError("");
    try {
      const { controlRoomService } =
        await import("@/plugins/control_room/services/controlRoomService");
      await controlRoomService.createCRUser({
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        team_ids: crTeamIds,
      });
      // Mirrors ACCESS_KEY/ME_KEY in plugins/control_room/hooks/useControlRoomAccess.ts.
      // Duplicated (not imported) on purpose — importing those constants would
      // reintroduce the static plugin dependency this dynamic import avoids.
      // Keep in sync if those keys ever change.
      void queryClient.invalidateQueries({ queryKey: ["control-room", "access"] });
      void queryClient.invalidateQueries({ queryKey: ["control-room", "me"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "profiles"] });
      onFormChange({ ...form, username: "", email: "", password: "" });
      resetCRState();
      onOpenChange(false);
    } catch (err: unknown) {
      const anyErr = err as { response?: { data?: { error?: string } } };
      const msg = anyErr?.response?.data?.error;
      setCrError(msg || "Failed to create Control Room user.");
    } finally {
      setCrSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    if (userType === "cr") {
      handleCRSubmit(e);
    } else {
      onSubmit(e);
    }
  };

  const assignmentVisible =
    assignmentOpen || Object.keys(formErrors).some((key) => !ACCOUNT_ERROR_KEYS.has(key));
  const teams = (teamsData || []) as unknown as Team[];
  const submitting = userType === "cr" ? crSubmitting : isSubmitting;

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
        <GeneratedPasswordField
          value={form.password}
          onChange={(v) => updateField("password", v)}
          error={formErrors.password}
        />
        <FormInputField
          label="Employee Code"
          value={form.code ?? ""}
          onChange={(v) => updateField("code", v)}
          error={formErrors.code}
        />
      </ModalSection>

      {userType === "standard" ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="control-sm"
            className="-ml-2 self-start"
            aria-expanded={assignmentVisible}
            onClick={() => setAssignmentOpen((open) => !open)}
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform motion-reduce:transition-none ${
                assignmentVisible ? "rotate-180" : ""
              }`}
              aria-hidden="true"
            />
            Assignment & roles
            <span className="text-muted-foreground text-xs font-normal">(optional)</span>
          </Button>
          {assignmentVisible && (
            <UserFormCore
              form={form}
              updateField={updateField}
              prefix="c"
              teamsData={teamsData}
              techsData={techsData}
              albanianTLs={albanianTLs}
              italianTLs={italianTLs}
            />
          )}
        </>
      ) : (
        <div className="space-y-2" role="group" aria-labelledby="user-create-scopes-label">
          <Label id="user-create-scopes-label">Team Scopes</Label>
          <TeamMultiSelect teams={teams} value={crTeamIds} onChange={setCrTeamIds} />
          <p className="text-muted-foreground text-xs">
            Empty scope means no visibility (not global). Admin/staff always have global access.
          </p>
        </div>
      )}
    </FormDialog>
  );
};
