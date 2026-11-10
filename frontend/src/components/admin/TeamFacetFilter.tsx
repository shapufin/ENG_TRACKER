/**
 * TeamFacetFilter — inline multi-select team chips for the Admin Users page,
 * rendered below TechFacetFilter so Tech and Team narrow the list together
 * (e.g. Infrastructure tech + a specific team). Server-side filtered via the
 * `team` query param (see useUserManagement / apps/users/viewsets.py).
 */
import React from "react";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import { toggleChipSelection } from "@/components/ui/chipSelection";
import type { Team } from "@/types";

interface TeamFacetFilterProps {
  teams: Team[];
  selectedTeamIds: number[];
  onTeamIdsChange: (ids: number[]) => void;
}

const ALL = "all";
const MULTI_HINT = "Click to filter by one team; Ctrl+click to select multiple";

export const TeamFacetFilter: React.FC<TeamFacetFilterProps> = ({
  teams,
  selectedTeamIds,
  onTeamIdsChange,
}) => {
  const handleChipClick = (value: string, event: React.MouseEvent<HTMLButtonElement>) => {
    if (value === ALL) {
      onTeamIdsChange([]);
      return;
    }
    const id = Number(value);
    const multi = event.ctrlKey || event.metaKey;
    onTeamIdsChange(toggleChipSelection(selectedTeamIds, id, multi));
  };

  if (teams.length === 0) return null;

  return (
    <div>
      <FilterChipRow
        label="Team"
        options={[
          { value: ALL, label: "All teams" },
          ...teams.map((team) => ({
            value: String(team.id),
            label: team.name,
            title: MULTI_HINT,
          })),
        ]}
        selected={selectedTeamIds.length === 0 ? [ALL] : selectedTeamIds.map(String)}
        onToggle={() => {}}
        onChipClick={handleChipClick}
      />
    </div>
  );
};
