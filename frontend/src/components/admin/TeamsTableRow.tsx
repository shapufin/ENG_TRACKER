import React from "react";
import { Edit3 } from "lucide-react";
import { RowActions } from "@/components/ui/RowActions";
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
    className="hover:bg-table-hover grid items-center gap-4 px-6 py-5 transition-all"
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
        <div className="bg-primary/10 text-foreground flex h-[var(--control-h)] w-[var(--control-h)] items-center justify-center rounded-2xl font-semibold">
          {getInitials(team.name)}
        </div>
        <div>
          <p className="font-semibold">{team.name}</p>
          <p className="text-muted-foreground text-sm">
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
          <Badge className="bg-muted text-foreground hover:bg-muted rounded-full px-4 py-1">
            {team.calendar_group}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </div>
    )}

    {isTeamsColumnVisible(columnVisibility, "members") && (
      <div className="font-medium tabular-nums">{team.members_count || 0}</div>
    )}

    {isTeamsColumnVisible(columnVisibility, "leader") && (
      <div className="text-muted-foreground">{team.team_leader?.username || "—"}</div>
    )}

    {isTeamsColumnVisible(columnVisibility, "actions") && (
      <div>
        <RowActions
          reveal="always"
          actions={[{ label: `Edit team ${team.name}`, icon: Edit3, onClick: () => onEdit(team) }]}
        />
      </div>
    )}
  </div>
);
