import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import type { Team } from "@/types";
import { TeamsTableToolbar } from "./TeamsTableToolbar";
import { TeamsTableHeader } from "./TeamsTableHeader";
import { TeamsTableRow } from "./TeamsTableRow";
import { TeamsTableFooter } from "./TeamsTableFooter";

interface TeamsTableProps {
  teams: Team[];
  selectedTeams: Set<number>;
  onSelectionChange: (selectedIds: Set<number>) => void;
  onEditTeam: (team: Team) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const TeamsTable: React.FC<TeamsTableProps> = ({
  teams,
  selectedTeams,
  onSelectionChange,
  onEditTeam,
  searchQuery,
  onSearchChange,
}) => {
  const handleSelectAll = (checked: boolean) => {
    onSelectionChange(checked ? new Set(teams.map((t) => t.id)) : new Set());
  };

  const handleSelectTeam = (teamId: number, checked: boolean) => {
    const newSelection = new Set(selectedTeams);
    if (checked) newSelection.add(teamId);
    else newSelection.delete(teamId);
    onSelectionChange(newSelection);
  };

  const filteredTeams = teams.filter(
    (team) =>
      team.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      team.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const allSelected =
    filteredTeams.length > 0 && filteredTeams.every((t) => selectedTeams.has(t.id));

  return (
    <GlassCard isHoverLift={false}>
      <TeamsTableToolbar searchQuery={searchQuery} onSearchChange={onSearchChange} />
      <TeamsTableHeader allSelected={allSelected} onSelectAll={handleSelectAll} />

      <div className="divide-y divide-border/50">
        {filteredTeams.map((team) => (
          <TeamsTableRow
            key={team.id}
            team={team}
            isSelected={selectedTeams.has(team.id)}
            onSelect={handleSelectTeam}
            onEdit={onEditTeam}
          />
        ))}
      </div>

      <TeamsTableFooter count={filteredTeams.length} />
    </GlassCard>
  );
};
