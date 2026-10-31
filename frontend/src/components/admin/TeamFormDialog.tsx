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
const NO_LEADER = "none";
const NO_PARENT = "none";

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
  /** People who can lead a team (TL role or members assigned). */
  leaders: { id: number; username: string; full_name?: string }[];
  /** Active teams, for the parent picker (the edited team is excluded). */
  teams: Team[];
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
  leaders,
  teams,
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
      <ModalSection title="Leadership" columns={2}>
        <div className="space-y-2">
          <Label htmlFor="team-leader">Team leader</Label>
          <Select
            value={form.team_leader_id || NO_LEADER}
            onValueChange={(value) =>
              updateField("team_leader_id", value === NO_LEADER ? "" : value)
            }
          >
            <SelectTrigger id="team-leader">
              <SelectValue placeholder="No leader" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_LEADER}>No leader</SelectItem>
              {leaders.map((leader) => (
                <SelectItem key={leader.id} value={String(leader.id)}>
                  {leader.full_name || leader.username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            The team leader approves this team&apos;s requests.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="team-parent">Parent team</Label>
          <Select
            value={form.parent_team || NO_PARENT}
            onValueChange={(value) => updateField("parent_team", value === NO_PARENT ? "" : value)}
          >
            <SelectTrigger id="team-parent">
              <SelectValue placeholder="No parent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PARENT}>No parent</SelectItem>
              {teams
                .filter((team) => team.id !== editing?.id)
                .map((team) => (
                  <SelectItem key={team.id} value={String(team.id)}>
                    {team.name} ({team.code})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">Sub-teams nest under their parent.</p>
        </div>
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
