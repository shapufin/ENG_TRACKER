import React from "react";
import { Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { Team } from "@/types";
import { isTeamsColumnVisible, teamsGridTemplate } from "./teamsColumns";

interface TeamsTableRowProps {
  team: Team;
  isSelected: boolean;
  onSelect: (teamId: number, checked: boolean) => void;
  onEdit: (team: Team) => void;
  columnVisibility?: Record<string, boolean>;
}

const getInitials = (name: string): string =>
  name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

// fallow-ignore-next-line complexity
export const TeamsTableRow: React.FC<TeamsTableRowProps> = ({
  team,
  isSelected,
  onSelect,
  onEdit,
  columnVisibility = {},
}) => (
  <div
    className="grid items-center gap-4 px-6 py-5 transition-all hover:bg-table-hover"
    style={{ gridTemplateColumns: teamsGridTemplate(columnVisibility) }}
  >
    <div>
      <Checkbox
        checked={isSelected}
        onCheckedChange={(checked) => onSelect(team.id, checked as boolean)}
        className="border-primary/40"
        aria-label={`Select team ${team.name}`}
      />
    </div>

    {isTeamsColumnVisible(columnVisibility, "team") && (
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 font-semibold text-foreground">
          {getInitials(team.name)}
        </div>
        <div>
          <p className="font-semibold">{team.name}</p>
          <p className="text-sm text-muted-foreground">
            {team.calendar_group ? "Shared visibility enabled" : "No group"}
          </p>
        </div>
      </div>
    )}

    {isTeamsColumnVisible(columnVisibility, "code") && (
      <div className="text-foreground/80">{team.code}</div>
    )}

    {isTeamsColumnVisible(columnVisibility, "calendar_group") && (
      <div>
        {team.calendar_group ? (
          <Badge className="rounded-full bg-muted px-4 py-1 text-foreground hover:bg-muted">
            {team.calendar_group}
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </div>
    )}

    {isTeamsColumnVisible(columnVisibility, "members") && (
      <div className="font-medium">{team.members_count || 0}</div>
    )}

    {isTeamsColumnVisible(columnVisibility, "leader") && (
      <div className="text-muted-foreground">{team.team_leader?.username || "—"}</div>
    )}

    {isTeamsColumnVisible(columnVisibility, "actions") && (
      <div>
        <Button
          size="icon"
          variant="outline"
          className="h-10 w-10 rounded-xl border-border bg-muted/30"
          onClick={() => onEdit(team)}
        >
          <Edit3 className="h-4 w-4" />
        </Button>
      </div>
    )}
  </div>
);
