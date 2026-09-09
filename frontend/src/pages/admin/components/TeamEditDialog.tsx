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
import type { Team } from "@/types";

interface TeamEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTeam: Team | null;
  formValue: string;
  onFormChange: (value: string) => void;
  calendarGroups: { calendar_group: string; team_count: number }[] | undefined;
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

// fallow-ignore-next-line complexity
export const TeamEditDialog: React.FC<TeamEditDialogProps> = ({
  open,
  onOpenChange,
  editingTeam,
  formValue,
  onFormChange,
  calendarGroups,
  isSubmitting,
  onSubmit,
}) => {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingTeam ? `Edit ${editingTeam.name}` : "Edit Team Calendar"}
      description="Rename the team or change its shared calendar group."
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label
            htmlFor="team-edit-name"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Team
          </Label>
          <Input id="team-edit-name" value={editingTeam?.name ?? ""} disabled />
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="team-edit-group"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Calendar Group
          </Label>
          <Select value={formValue || "none"} onValueChange={onFormChange}>
            <SelectTrigger id="team-edit-group" className="h-10 px-3">
              <SelectValue placeholder="No shared group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No shared group</SelectItem>
              {(calendarGroups ?? []).map((g) => (
                <SelectItem key={g.calendar_group} value={g.calendar_group}>
                  {g.calendar_group}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Use the same group value on teams that should share calendar visibility.
          </p>
        </div>
      </div>
    </FormDialog>
  );
};
