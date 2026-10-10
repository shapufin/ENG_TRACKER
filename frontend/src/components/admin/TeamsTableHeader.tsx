import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { TABLE_HEAD_GRID_CLASS } from "@/components/ui/tableStyles";
import { cn } from "@/lib/utils";
import { isTeamsColumnVisible, teamsGridTemplate, TEAMS_COLUMNS } from "./teamsColumns";

interface TeamsTableHeaderProps {
  allSelected: boolean;
  onSelectAll: (checked: boolean) => void;
  columnVisibility?: Record<string, boolean>;
}

export const TeamsTableHeader: React.FC<TeamsTableHeaderProps> = ({
  allSelected,
  onSelectAll,
  columnVisibility = {},
}) => (
  <div
    className={cn("grid", TABLE_HEAD_GRID_CLASS)}
    style={{ gridTemplateColumns: teamsGridTemplate(columnVisibility) }}
  >
    <div>
      <Checkbox checked={allSelected} onCheckedChange={onSelectAll} className="border-primary/40" />
    </div>
    {TEAMS_COLUMNS.filter((c) => isTeamsColumnVisible(columnVisibility, c.id)).map((c) => (
      <div key={c.id}>{c.label}</div>
    ))}
  </div>
);
