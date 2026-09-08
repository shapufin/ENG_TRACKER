import React from "react";

import { FormDialog } from "@/components/ui/FormDialog";
import { FormField } from "@/components/ui/FormField";
import type { Team } from "@/types";

interface CalendarGroup {
  calendar_group: string;
  team_count: number;
}

interface TeamFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Team | null;
  form: {
    name: string;
    code: string;
    description: string;
    team_leader_id: string;
    parent_team: string;
    calendar_group: string;
  };
  onFormChange: (form: TeamFormDialogProps["form"]) => void;
  formErrors: Record<string, string>;
  onFormErrorsChange: (errors: Record<string, string>) => void;
  groups: CalendarGroup[] | undefined;
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting: boolean;
}

export const TeamFormDialog: React.FC<TeamFormDialogProps> = ({
  open,
  onOpenChange,
  editing,
  form,
  onFormChange,
  formErrors,
  onFormErrorsChange,
  groups,
  onSubmit,
  isSubmitting,
}) => {
  const updateField = (key: keyof typeof form, value: string) => {
    onFormChange({ ...form, [key]: value });
    if (formErrors[key]) {
      const next = { ...formErrors };
      delete next[key];
      onFormErrorsChange(next);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit Team" : "New Team"}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
    >
      <div className="grid grid-cols-2 gap-4">
        <FormField
          id="team-name"
          label="Name"
          value={form.name}
          onChange={(value) => updateField("name", value)}
          error={formErrors.name}
          required
        />
        <FormField
          id="team-code"
          label="Code"
          value={form.code}
          onChange={(value) => updateField("code", value)}
          error={formErrors.code}
          required
        />
      </div>
      <FormField
        id="team-description"
        label="Description"
        value={form.description}
        onChange={(value) => updateField("description", value)}
        className="mt-4"
      />
      <div className="mt-4 space-y-2">
        <FormField
          id="team-calendar-group"
          label="Calendar Group"
          value={form.calendar_group}
          onChange={(value) => updateField("calendar_group", value)}
          placeholder="e.g. italy, albania, shared"
          list="calendar-groups"
        />
        <datalist id="calendar-groups">
          <option value="" label="No group" />
          {groups?.map((g) => (
            <option key={g.calendar_group} value={g.calendar_group}>
              {g.calendar_group} ({g.team_count} teams)
            </option>
          ))}
        </datalist>
        <p className="text-xs text-muted-foreground">
          Teams with the same group share vacation/sick calendar visibility. Overtime and standby
          remain individual-only.
        </p>
      </div>
    </FormDialog>
  );
};
