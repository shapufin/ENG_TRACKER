import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Team } from "@/types";

interface TeamListItemProps {
  team: Team;
  actionLabel: string;
  actionVariant: "add" | "remove";
  onAction: () => void;
  isPending: boolean;
}

const avatarClasses = {
  add: "bg-muted font-semibold text-muted-foreground",
  remove: "bg-primary/20 font-semibold text-foreground",
};

const buttonClasses = {
  add: "border-primary/20 bg-primary/10 text-foreground hover:bg-primary/20",
  remove:
    "border-tone-danger-border bg-tone-danger-surface text-tone-danger-text hover:bg-tone-danger-border/40",
};

const TeamListItem: React.FC<TeamListItemProps> = ({
  team,
  actionLabel,
  actionVariant,
  onAction,
  isPending,
}) => (
  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
    <div className="flex items-center gap-3">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${avatarClasses[actionVariant]}`}
      >
        {team.name.slice(0, 2).toUpperCase()}
      </div>
      <div>
        <p className="font-medium">{team.name}</p>
        <p className="text-xs text-muted-foreground">{team.code}</p>
      </div>
    </div>
    <Button
      size="sm"
      variant="outline"
      className={`h-8 ${buttonClasses[actionVariant]}`}
      onClick={onAction}
      disabled={isPending}
    >
      {actionLabel}
    </Button>
  </div>
);

interface ManageTeamsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupName: string | null;
  teams: Team[];
  onUpdateTeam: (id: number, payload: { calendar_group: string }) => void;
  isPending: boolean;
}

export const ManageTeamsDialog: React.FC<ManageTeamsDialogProps> = ({
  open,
  onOpenChange,
  groupName,
  teams,
  onUpdateTeam,
  isPending,
}) => {
  const inGroup = teams.filter((t) => t.calendar_group === groupName);
  const available = teams.filter((t) => t.calendar_group !== groupName);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>Manage Teams in "{groupName}"</DialogTitle>
          <DialogDescription>
            Add or remove teams from this calendar group. Teams in the same group can view each
            other's calendar entries.
          </DialogDescription>
        </DialogHeader>
        <div className="no-scrollbar max-h-[min(400px,50vh)] min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-1">
          <div>
            <h4 className="mb-2 text-sm font-semibold">Teams in this group</h4>
            <div className="space-y-2">
              {inGroup.map((team) => (
                <TeamListItem
                  key={team.id}
                  team={team}
                  actionLabel="Remove"
                  actionVariant="remove"
                  onAction={() => onUpdateTeam(team.id, { calendar_group: "" })}
                  isPending={isPending}
                />
              ))}
              {inGroup.length === 0 && (
                <p className="text-sm text-muted-foreground">No teams in this group yet.</p>
              )}
            </div>
          </div>
          <div>
            <h4 className="mb-2 text-sm font-semibold">Available teams</h4>
            <div className="space-y-2">
              {available.map((team) => (
                <TeamListItem
                  key={team.id}
                  team={team}
                  actionLabel="Add"
                  actionVariant="add"
                  onAction={() => onUpdateTeam(team.id, { calendar_group: groupName || "" })}
                  isPending={isPending}
                />
              ))}
              {available.length === 0 && (
                <p className="text-sm text-muted-foreground">No available teams.</p>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
