/**
 * TeamFacetFilter — inline multi-select team chips for the Admin Users page,
 * rendered below TechFacetFilter so Tech and Team narrow the list together
 * (e.g. Infrastructure tech + a specific team). Server-side filtered via the
 * `team` query param (see useUserManagement / apps/users/viewsets.py).
 */
import React from "react";
import { Chip } from "@/components/ui/Chip";
import { FacetRow } from "./FacetRow";
import type { Team } from "@/types";

interface TeamFacetFilterProps {
  teams: Team[];
  selectedTeamIds: number[];
  onTeamIdsChange: (ids: number[]) => void;
}

export const TeamFacetFilter: React.FC<TeamFacetFilterProps> = ({
  teams,
  selectedTeamIds,
  onTeamIdsChange,
}) => {
  const toggleTeam = (id: number) => {
    onTeamIdsChange(
      selectedTeamIds.includes(id)
        ? selectedTeamIds.filter((v) => v !== id)
        : [...selectedTeamIds, id]
    );
  };

  const isAllActive = selectedTeamIds.length === 0;

  if (teams.length === 0) return null;

  return (
    <FacetRow label="Team">
      <Chip pressed={isAllActive} onClick={() => onTeamIdsChange([])}>
        All teams
      </Chip>
      {teams.map((team) => (
        <Chip
          key={team.id}
          pressed={selectedTeamIds.includes(team.id)}
          onClick={() => toggleTeam(team.id)}
        >
          {team.name}
        </Chip>
      ))}
    </FacetRow>
  );
};
