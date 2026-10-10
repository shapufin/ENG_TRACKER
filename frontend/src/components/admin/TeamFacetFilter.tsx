/**
 * TeamFacetFilter — inline multi-select team chips for the Admin Users page,
 * rendered below TechFacetFilter so Tech and Team narrow the list together
 * (e.g. Infrastructure tech + a specific team). Server-side filtered via the
 * `team` query param (see useUserManagement / apps/users/viewsets.py).
 */
import React from "react";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import type { Team } from "@/types";

interface TeamFacetFilterProps {
  teams: Team[];
  selectedTeamIds: number[];
  onTeamIdsChange: (ids: number[]) => void;
}

const ALL = "all";

export const TeamFacetFilter: React.FC<TeamFacetFilterProps> = ({
  teams,
  selectedTeamIds,
  onTeamIdsChange,
}) => {
  const toggleTeam = (value: string) => {
    if (value === ALL) {
      onTeamIdsChange([]);
      return;
    }
    const id = Number(value);
    onTeamIdsChange(
      selectedTeamIds.includes(id)
        ? selectedTeamIds.filter((v) => v !== id)
        : [...selectedTeamIds, id]
    );
  };

  if (teams.length === 0) return null;

  return (
    <div className="border-border/70 border-t pt-2">
      <FilterChipRow
        label="Team"
        options={[
          { value: ALL, label: "All teams" },
          ...teams.map((team) => ({ value: String(team.id), label: team.name })),
        ]}
        selected={selectedTeamIds.length === 0 ? [ALL] : selectedTeamIds.map(String)}
        onToggle={toggleTeam}
      />
    </div>
  );
};
