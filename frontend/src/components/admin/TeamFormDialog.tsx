import React, { useState } from "react";

import { FormDialog } from "@/components/ui/FormDialog";
import { FormField } from "@/components/ui/FormField";
import { Label } from "@/components/ui/label";
import { ModalSection } from "@/components/ui/ModalSection";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { normalizeCalendarGroup } from "@/lib/calendarGroup";
import type { Team } from "@/types";

const NO_GROUP = "none";
const NEW_GROUP = "__new__";

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
  const [creating, setCreating] = useState(false);
  const isNewGroup =
    creating ||
    (form.calendar_group !== "" && !groups?.some((g) => g.calendar_group === form.calendar_group));
  const normalized = normalizeCalendarGroup(form.calendar_group);

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
      description="Teams define who approves requests and shares calendars."
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
    >
      <ModalSection title="Team identity" columns={2}>
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
        <FormField
          id="team-description"
          label="Description"
          value={form.description}
          onChange={(value) => updateField("description", value)}
          className="sm:col-span-2"
        />
      </ModalSection>
      <ModalSection title="Calendar group" columns={1}>
        <div className="space-y-2">
          <Label htmlFor="team-calendar-group" className="sr-only">
            Calendar Group
          </Label>
          <Select
            value={isNewGroup ? NEW_GROUP : form.calendar_group || NO_GROUP}
            onValueChange={(value) => {
              setCreating(value === NEW_GROUP);
              updateField("calendar_group", value === NEW_GROUP || value === NO_GROUP ? "" : value);
            }}
          >
            <SelectTrigger id="team-calendar-group" className="px-3">
              <SelectValue placeholder="No group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_GROUP}>No group</SelectItem>
              {groups?.map((g) => (
                <SelectItem key={g.calendar_group} value={g.calendar_group}>
                  {g.calendar_group} ({g.team_count} {g.team_count === 1 ? "team" : "teams"})
                </SelectItem>
              ))}
              <SelectItem value={NEW_GROUP}>New group…</SelectItem>
            </SelectContent>
          </Select>
          {isNewGroup && (
            <FormField
              id="team-calendar-group-new"
              label="New group name"
              value={form.calendar_group}
              onChange={(value) => updateField("calendar_group", value)}
              helper={
                normalized && normalized !== form.calendar_group.trim()
                  ? `Will be saved as "${normalized}"`
                  : undefined
              }
            />
          )}
          <p className="text-muted-foreground text-xs">
            Teams in the same group can see each other's calendars.
          </p>
        </div>
      </ModalSection>
    </FormDialog>
  );
};
