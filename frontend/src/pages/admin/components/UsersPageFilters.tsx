import React from "react";
import { UserFilterTabs } from "@/components/admin/UserFilterTabs";
import { TechFacetFilter } from "@/components/admin/TechFacetFilter";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import { toneSurfaceClass } from "@/components/ui/tone";
import { cn } from "@/lib/utils";
import { CRUsersFilterButton } from "./CRUsersFilterButton";
import type { Team } from "@/types";
import type { useUsersPage } from "../hooks/useUsersPage";

type UsersPageState = ReturnType<typeof useUsersPage>;

const ROLE_LABELS: Record<string, string> = {
  all: "All users",
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
    (state.tlFilter !== "employee" && state.tlFilter !== "all") ||
    activeTechLabels.length > 0 ||
    state.noTechOnly ||
    state.crOnly ||
    activeTeamLabels.length > 0;
  // profilesCount is the server-side total for every active filter.
  const matchCount = state.profilesCount;

  return (
    <div className="border-line-subtle space-y-2 border-b pb-4">
      {/* UserFilterTabs is itself the labelled "Role" row; the CR chip joins it. */}
      <div className="flex flex-wrap items-center gap-2">
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
      </div>

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

      {teams.length > 0 && (
        <FilterChipRow
          label="Team"
          options={[
            { value: "all", label: "All teams" },
            ...teams.map((t) => ({ value: String(t.id), label: t.name })),
          ]}
          selected={state.teamIds.length === 0 ? ["all"] : state.teamIds.map(String)}
          onToggle={(val) => {
            if (val === "all") {
              state.setTeamIds([]);
              return;
            }
            const id = Number(val);
            state.setTeamIds(
              state.teamIds.includes(id)
                ? state.teamIds.filter((tid) => tid !== id)
                : [...state.teamIds, id]
            );
          }}
        />
      )}

      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="text-muted-foreground">Active:</span>
          {state.tlFilter !== "employee" && state.tlFilter !== "all" && (
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
