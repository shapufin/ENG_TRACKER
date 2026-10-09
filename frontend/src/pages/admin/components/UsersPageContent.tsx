import React from "react";
import { useSearchParams } from "react-router-dom";
import { UserBulkCommandDrawer } from "@/components/admin/UserBulkCommandDrawer";
import { PluginCRBulkCommandDrawer } from "@/components/admin/PluginCRUserDialogs";
import { UserStatsCards } from "./UserStatsCards";
import { UsersPageBulkBar } from "./UsersPageBulkBar";
import { UsersPageTable } from "./UsersPageTable";
import { UsersPageFilters } from "./UsersPageFilters";
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
  const initialSearch = useSearchParams()[0].get("q") ?? undefined;
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

        <PluginCRBulkCommandDrawer
          open={state.bulkCommandDrawerOpen}
          onOpenChange={state.setBulkCommandDrawerOpen}
          selectedUserIds={selectedUserIds}
          selectedNames={selectedNames}
          teams={teams}
          onClearSelection={() => state.setRowSelection({})}
        />

        <UsersPageTable
          initialSearch={initialSearch}
          columns={columns}
          data={state.filteredData}
          rowSelection={state.rowSelection}
          onRowSelectionChange={state.handleRowSelectionChange}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {state.stats && <UserStatsCards stats={state.stats} />}

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
        filters={<UsersPageFilters state={state} teams={teams} />}
        initialSearch={initialSearch}
        columns={columns}
        data={state.filteredData}
        rowSelection={state.rowSelection}
        onRowSelectionChange={state.handleRowSelectionChange}
      />
    </div>
  );
};
