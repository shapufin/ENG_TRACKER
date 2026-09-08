import React from "react";
import { Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  <div className="grid grid-cols-[80px_2fr_1.5fr_1.5fr_1fr_1fr_120px] items-center gap-4 px-6 py-5 transition-all hover:bg-muted/30">
    <div>
      <Checkbox
        checked={isSelected}
        onCheckedChange={(checked) => onSelect(team.id, checked as boolean)}
        className="border-primary/40"
        aria-label={`Select team ${team.name}`}
      />
    </div>

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

    <div className="text-foreground/80">{team.code}</div>

    <div>
      {team.calendar_group ? (
        <Badge className="rounded-full bg-muted px-4 py-1 text-foreground hover:bg-muted">
          {team.calendar_group}
        </Badge>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      )}
    </div>

    <div className="font-medium">{team.members_count || 0}</div>

    <div className="text-muted-foreground">{team.team_leader?.username || "—"}</div>

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
  </div>
);
