import React from "react";
import { Edit3 } from "lucide-react";
import { RowActions } from "@/components/ui/RowActions";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { Team } from "@/types";

interface TeamsTableRowProps {
  team: Team;
  isSelected: boolean;
  onSelect: (teamId: number, checked: boolean) => void;
  onEdit: (team: Team) => void;
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
}) => (
  <div className="hover:bg-table-hover grid grid-cols-[80px_2fr_1.5fr_1.5fr_1fr_1fr_120px] items-center gap-4 px-6 py-5 transition-all">
    <div>
      <Checkbox
        checked={isSelected}
        onCheckedChange={(checked) => onSelect(team.id, checked as boolean)}
        className="border-primary/40"
        aria-label={`Select team ${team.name}`}
      />
    </div>

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

    <div className="text-foreground/80">{team.code}</div>

    <div>
      {team.calendar_group ? (
        <Badge className="bg-muted text-foreground hover:bg-muted rounded-full px-4 py-1">
          {team.calendar_group}
        </Badge>
      ) : (
        <span className="text-muted-foreground text-sm">—</span>
      )}
    </div>

    <div className="font-medium">{team.members_count || 0}</div>

    <div className="text-muted-foreground">{team.team_leader?.username || "—"}</div>

    <div>
      <RowActions
        reveal="always"
        actions={[{ label: `Edit team ${team.name}`, icon: Edit3, onClick: () => onEdit(team) }]}
      />
    </div>
  </div>
);
