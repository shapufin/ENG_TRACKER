import React from "react";
import { UserFilterTabs } from "@/components/admin/UserFilterTabs";
import { UserBulkCommandDrawer } from "@/components/admin/UserBulkCommandDrawer";
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

  return (
    <div className="space-y-4 pb-8">
      {state.stats && <UserStatsCards stats={state.stats} />}
      <div className="flex flex-wrap items-center gap-4">
        <UserFilterTabs filter={state.tlFilter} onFilterChange={state.setTlFilter} />
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
