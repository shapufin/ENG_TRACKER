import React from "react";
import { UserFilterTabs } from "@/components/admin/UserFilterTabs";
import { TechFacetFilter } from "@/components/admin/TechFacetFilter";
import { UserBulkCommandDrawer } from "@/components/admin/UserBulkCommandDrawer";
import { toneSurfaceClass } from "@/components/ui/tone";
import { cn } from "@/lib/utils";
import { CRBulkCommandDrawer } from "@/plugins/control_room/components/CRBulkCommandDrawer";
import { UserStatsCards } from "./UserStatsCards";
import { UsersPageBulkBar } from "./UsersPageBulkBar";
import { UsersPageTable } from "./UsersPageTable";
import { CRUsersFilterButton } from "./CRUsersFilterButton";
import type { Team } from "@/types";
import type { useUsersPage } from "../hooks/useUsersPage";
import type { useUserColumns } from "../hooks/useUserColumns";

type UsersPageState = ReturnType<typeof useUsersPage>;
type Columns = ReturnType<typeof useUserColumns>;

interface UsersPageContentProps {
  state: UsersPageState;
  columns: Columns;
}

export const UsersPageContent: React.FC<UsersPageContentProps> = ({ state, columns }) => {
  const teams = (state.teamsData || []) as unknown as Team[];
  // CR-only admin: render the CR bulk drawer instead of the standard one.
  // The standard drawer targets core UserProfile fields (teams/TL/roles) that
  // CR admins cannot manage; the CR drawer targets CR access fields
  // (team scopes + is_active) via the plugin's bulk_update_cr_users endpoint.
  if (state.isCROnlyAdmin) {
    const selectedUserIds = state.selectedProfiles.map((p) => p.user.id);
    const selectedNames = state.selectedProfiles.map((p) => p.user?.username ?? "");
    return (
      <div className="space-y-4 pb-8">
        <div className="flex flex-wrap items-center gap-4">
          {state.crActive && (
            <CRUsersFilterButton
              active={state.crOnly}
              onToggle={() => state.setCrOnly(!state.crOnly)}
            />
          )}
        </div>

        <UsersPageBulkBar
          selectedCount={state.selectedProfiles.length}
          onClear={() => state.setRowSelection({})}
          onBulkActions={() => state.setBulkCommandDrawerOpen(true)}
        />

        <CRBulkCommandDrawer
          open={state.bulkCommandDrawerOpen}
          onOpenChange={state.setBulkCommandDrawerOpen}
          selectedUserIds={selectedUserIds}
          selectedNames={selectedNames}
          teams={teams}
          onClearSelection={() => state.setRowSelection({})}
        />

        <UsersPageTable
          columns={columns}
          data={state.filteredData}
          rowSelection={state.rowSelection}
          onRowSelectionChange={state.handleRowSelectionChange}
        />
      </div>
    );
  }

  const roleLabels: Record<string, string> = {
    italian_tl: "Italian TL",
    albanian_tl: "Albanian TL",
    no_tl: "No TL",
  };
  const activeTechLabels = state.techFacets
    .filter((f) => state.techIds.includes(f.id))
    .map((f) => {
      const levels = (f.levels ?? [])
        .filter((level) => state.techLevelIds.includes(level.id))
        .map((level) => level.code);
      return levels.length > 0 ? `${f.name} (${levels.join(", ")})` : f.name;
    });
  const hasActiveFilters =
    state.tlFilter !== "all" || activeTechLabels.length > 0 || state.noTechOnly;
  // profilesCount is the server-side total for the active role/tech filters
  // (accurate even past the page cap); once CR-only narrows the page
  // client-side, fall back to the actually-displayed row count.
  const matchCount = state.crOnly ? state.filteredData.length : state.profilesCount;

  return (
    <div className="space-y-4 pb-8">
      {state.stats && <UserStatsCards stats={state.stats} />}
      <div className="space-y-3 rounded-2xl border border-border/70 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <UserFilterTabs filter={state.tlFilter} onFilterChange={state.setTlFilter} />
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

        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-muted-foreground">Active:</span>
            {state.tlFilter !== "all" && (
              <span
                className={cn(
                  "rounded-md border px-2 py-0.5 font-mono font-semibold",
                  toneSurfaceClass.accent
                )}
              >
                role: {roleLabels[state.tlFilter] ?? state.tlFilter}
              </span>
            )}
            {state.noTechOnly && (
              <span
                className={cn(
                  "rounded-md border px-2 py-0.5 font-mono font-semibold",
                  toneSurfaceClass.info
                )}
              >
                tech: No tech
              </span>
            )}
            {activeTechLabels.map((label) => (
              <span
                key={label}
                className={cn(
                  "rounded-md border px-2 py-0.5 font-mono font-semibold",
                  toneSurfaceClass.info
                )}
              >
                tech: {label}
              </span>
            ))}
            <button
              type="button"
              className="text-muted-foreground underline hover:text-destructive"
              onClick={() => {
                state.setTlFilter("all");
                state.setTechIds([]);
                state.setTechLevelIds([]);
                state.setNoTechOnly(false);
              }}
            >
              Clear all
            </button>
            <span className="ml-auto font-mono text-muted-foreground">
              · {matchCount} users match
            </span>
          </div>
        )}
      </div>

      <UsersPageBulkBar
        selectedCount={state.selectedProfiles.length}
        onClear={() => state.setRowSelection({})}
        onBulkActions={() => state.setBulkCommandDrawerOpen(true)}
        onDelete={() => state.setBulkDeleteConfirmOpen(true)}
      />

      <UserBulkCommandDrawer
        key={state.bulkCommandDrawerOpen ? "bulk-open" : "bulk-closed"}
        open={state.bulkCommandDrawerOpen}
        onOpenChange={state.setBulkCommandDrawerOpen}
        selectedProfiles={state.selectedProfiles}
        teams={{ results: state.teamsData }}
        techs={{ results: state.techs }}
        italianTLs={state.italianTLs}
        albanianTLs={state.albanianTLs}
        onBulkUpdate={state.handleBulkUpdate}
        isMutating={state.bulkUpdateMutation.isPending}
      />

      <UsersPageTable
        columns={columns}
        data={state.filteredData}
        rowSelection={state.rowSelection}
        onRowSelectionChange={state.handleRowSelectionChange}
      />
    </div>
  );
};
