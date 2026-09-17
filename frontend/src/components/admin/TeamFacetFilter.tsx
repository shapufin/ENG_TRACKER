/**
 * TeamFacetFilter — inline multi-select team chips for the Admin Users page,
 * rendered below TechFacetFilter so Tech and Team narrow the list together
 * (e.g. Infrastructure tech + a specific team). Server-side filtered via the
 * `team` query param (see useUserManagement / apps/users/viewsets.py).
 */
import React from "react";
import { cn } from "@/lib/utils";
import { toneSurfaceClass } from "@/components/ui/tone";
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
    <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-2">
      <span className="mr-1 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Team filter
      </span>
      <button
        type="button"
        onClick={() => onTeamIdsChange([])}
        className={cn(
          "rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors",
          isAllActive
            ? toneSurfaceClass.accent
            : "border-border bg-background text-muted-foreground hover:border-primary/30"
        )}
      >
        All teams
      </button>
      {teams.map((team) => {
        const isActive = selectedTeamIds.includes(team.id);
        return (
          <button
            key={team.id}
            type="button"
            onClick={() => toggleTeam(team.id)}
            aria-pressed={isActive}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors",
              isActive
                ? toneSurfaceClass.info
                : "border-border bg-background text-foreground/80 hover:border-primary/30"
            )}
          >
            {team.name}
          </button>
        );
      })}
    </div>
  );
};
