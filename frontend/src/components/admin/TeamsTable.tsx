import React, { useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import type { Team } from "@/types";
import { loadTeamsColumnVisibility, saveTeamsColumnVisibility } from "./teamsColumns";
import { TeamsTableToolbar } from "./TeamsTableToolbar";
import { TeamsTableHeader } from "./TeamsTableHeader";
import { TeamsTableRow } from "./TeamsTableRow";
import { TeamsTableFooter } from "./TeamsTableFooter";

export type TeamStatusFilter = "all" | "grouped" | "ungrouped";

interface TeamsTableProps {
  teams: Team[];
  selectedTeams: Set<number>;
  onSelectionChange: (selectedIds: Set<number>) => void;
  onEditTeam: (team: Team) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter?: TeamStatusFilter;
  onStatusFilterChange?: (status: TeamStatusFilter) => void;
  /** Restricts the table to one calendar group (set from the group card). */
  groupFilter?: string | null;
  /** Existing group names, offered by the inline "Assign group" popover. */
  groupNames?: string[];
  onAssignGroup?: (team: Team, group: string) => void;
  onUnlinkTeam?: (team: Team) => void;
}

export const TeamsTable: React.FC<TeamsTableProps> = ({
  teams,
  selectedTeams,
  onSelectionChange,
  onEditTeam,
  searchQuery,
  onSearchChange,
  statusFilter = "all",
  onStatusFilterChange,
  groupFilter = null,
  groupNames = [],
  onAssignGroup,
  onUnlinkTeam,
}) => {
  const [columnVisibility, setColumnVisibility] =
    useState<Record<string, boolean>>(loadTeamsColumnVisibility);

  const handleColumnVisibilityChange = (visibility: Record<string, boolean>) => {
    setColumnVisibility(visibility);
    saveTeamsColumnVisibility(visibility);
  };

  const handleSelectAll = (checked: boolean) => {
    onSelectionChange(checked ? new Set(teams.map((t) => t.id)) : new Set());
  };

  const handleSelectTeam = (teamId: number, checked: boolean) => {
    const newSelection = new Set(selectedTeams);
    if (checked) newSelection.add(teamId);
    else newSelection.delete(teamId);
    onSelectionChange(newSelection);
  };

  const statusCounts = {
    all: teams.length,
    grouped: teams.filter((t) => t.calendar_group).length,
    ungrouped: teams.filter((t) => !t.calendar_group).length,
  };

  const filteredTeams = teams.filter(
    (team) =>
      (team.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        team.code.toLowerCase().includes(searchQuery.toLowerCase())) &&
      (statusFilter === "all" ||
        (statusFilter === "grouped" ? !!team.calendar_group : !team.calendar_group)) &&
      (!groupFilter || team.calendar_group === groupFilter)
  );

  const allSelected =
    filteredTeams.length > 0 && filteredTeams.every((t) => selectedTeams.has(t.id));

  return (
    <GlassCard>
      <TeamsTableToolbar
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        statusFilter={statusFilter}
        onStatusFilterChange={onStatusFilterChange}
        statusCounts={statusCounts}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={handleColumnVisibilityChange}
      />
      <TeamsTableHeader
        allSelected={allSelected}
        onSelectAll={handleSelectAll}
        columnVisibility={columnVisibility}
      />

      <div className="divide-border/50 divide-y">
        {filteredTeams.map((team) => (
          <TeamsTableRow
            key={team.id}
            team={team}
            isSelected={selectedTeams.has(team.id)}
            onSelect={handleSelectTeam}
            onEdit={onEditTeam}
            groupNames={groupNames}
            onAssign={onAssignGroup}
            onUnlink={onUnlinkTeam}
            columnVisibility={columnVisibility}
          />
        ))}
      </div>

      <TeamsTableFooter count={filteredTeams.length} />
    </GlassCard>
  );
};
