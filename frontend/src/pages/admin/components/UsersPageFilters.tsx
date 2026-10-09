import React from "react";
import { UserFilterTabs } from "@/components/admin/UserFilterTabs";
import { TechFacetFilter } from "@/components/admin/TechFacetFilter";
import { TeamFacetFilter } from "@/components/admin/TeamFacetFilter";
import { FacetRow } from "@/components/admin/FacetRow";
import { toneSurfaceClass } from "@/components/ui/tone";
import { cn } from "@/lib/utils";
import { CRUsersFilterButton } from "./CRUsersFilterButton";
import type { Team } from "@/types";
import type { useUsersPage } from "../hooks/useUsersPage";

type UsersPageState = ReturnType<typeof useUsersPage>;

const ROLE_LABELS: Record<string, string> = {
  employee: "Employees",
  italian_tl: "Italian TL",
  albanian_tl: "Albanian TL",
  hbpr: "HBPR",
  hr: "HR",
  cr_admin: "CR Admin",
};

const ACTIVE_CHIP = "rounded-md border px-2 py-0.5 font-mono text-xs font-semibold";

interface UsersPageFiltersProps {
  state: UsersPageState;
  teams: Team[];
}

/**
 * Role / tech / team filters. Rendered as the header strip of the users table
 * card (page and card are the only two surface levels), never as a card of
 * its own.
 */
export const UsersPageFilters: React.FC<UsersPageFiltersProps> = ({ state, teams }) => {
  const activeTechLabels = state.techFacets
    .filter((f) => state.techIds.includes(f.id))
    .map((f) => {
      const levels = (f.levels ?? [])
        .filter((level) => state.techLevelIds.includes(level.id))
        .map((level) => level.code);
      return levels.length > 0 ? `${f.name} (${levels.join(", ")})` : f.name;
    });
  const activeTeamLabels = teams.filter((t) => state.teamIds.includes(t.id)).map((t) => t.name);
  const hasActiveFilters =
    state.tlFilter !== "employee" ||
    activeTechLabels.length > 0 ||
    state.noTechOnly ||
    state.crOnly ||
    activeTeamLabels.length > 0;
  // profilesCount is the server-side total for the active role/tech filters
  // (accurate even past the page cap); once CR-only narrows the page
  // client-side, fall back to the actually-displayed row count.
  const matchCount = state.crOnly ? state.filteredData.length : state.profilesCount;

  return (
    <div className="border-line-subtle space-y-2 border-b pb-4">
      <FacetRow label="Role">
        <UserFilterTabs
          filter={state.tlFilter}
          onFilterChange={state.setTlFilter}
          showCRAdmin={state.crActive}
        />
        {state.crActive && (
          <CRUsersFilterButton
            active={state.crOnly}
            onToggle={() => state.setCrOnly(!state.crOnly)}
          />
        )}
      </FacetRow>

      <TechFacetFilter
        facets={state.techFacets}
        noTechCount={state.noTechCount}
        selectedTechIds={state.techIds}
        selectedLevelIds={state.techLevelIds}
        noTechOnly={state.noTechOnly}
        onTechIdsChange={state.setTechIds}
        onLevelIdsChange={state.setTechLevelIds}
        onNoTechOnlyChange={state.setNoTechOnly}
      />

      <TeamFacetFilter
        teams={teams}
        selectedTeamIds={state.teamIds}
        onTeamIdsChange={state.setTeamIds}
      />

      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="text-muted-foreground">Active:</span>
          {state.tlFilter !== "employee" && (
            <span className={cn(ACTIVE_CHIP, toneSurfaceClass.accent)}>
              role: {ROLE_LABELS[state.tlFilter] ?? state.tlFilter}
            </span>
          )}
          {state.crOnly && (
            <span className={cn(ACTIVE_CHIP, toneSurfaceClass.accent)}>CR only</span>
          )}
          {state.noTechOnly && (
            <span className={cn(ACTIVE_CHIP, toneSurfaceClass.info)}>tech: No tech</span>
          )}
          {activeTechLabels.map((label) => (
            <span key={label} className={cn(ACTIVE_CHIP, toneSurfaceClass.info)}>
              tech: {label}
            </span>
          ))}
          {activeTeamLabels.map((label) => (
            <span key={label} className={cn(ACTIVE_CHIP, toneSurfaceClass.info)}>
              team: {label}
            </span>
          ))}
          <button
            type="button"
            className="text-muted-foreground hover:text-destructive focus-visible:ring-focus inline-flex min-h-6 items-center rounded-sm underline focus-visible:ring-2 focus-visible:outline-hidden"
            onClick={() => {
              state.setTlFilter("employee");
              state.setTechIds([]);
              state.setTechLevelIds([]);
              state.setNoTechOnly(false);
              state.setTeamIds([]);
              state.setCrOnly(false);
            }}
          >
            Clear all
          </button>
          <span className="text-muted-foreground ml-auto font-mono">
            · {matchCount} {matchCount === 1 ? "user matches" : "users match"}
          </span>
        </div>
      )}
    </div>
  );
};
