import React from "react";
import { DataTable, type DataTableServerMode } from "@/components/ui/DataTable";
import { USERS_PAGE_SIZE } from "@/hooks/useUserManagement";
import { GlassCard } from "@/components/ui/GlassCard";
import type { UserProfile } from "@/types";
import type { RowSelectionState, OnChangeFn } from "@tanstack/react-table";
import type { AppColumnDef } from "@/components/ui/tableTypes";
import type { DataTableCardSpec } from "@/components/ui/DataTableCards";

/** Phone card: name and role up top, then team, tech and the assigned leaders. */
const USER_CARD: DataTableCardSpec = {
  title: "username",
  status: "tl_role",
  meta: ["team", "techs", "it_tl_assigned", "al_tl_assigned"],
};

interface UsersPageTableProps {
  columns: AppColumnDef<UserProfile>[];
  data: UserProfile[];
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  /** Search and paging are answered by the server over the whole user set. */
  server: DataTableServerMode;
  /** Filter strip rendered above the table, inside the same card. */
  filters?: React.ReactNode;
  /** Filter controls that share the search/Columns toolbar row. */
  toolbarActions?: React.ReactNode;
}

export const UsersPageTable: React.FC<UsersPageTableProps> = ({
  columns,
  data,
  rowSelection,
  onRowSelectionChange,
  server,
  filters,
  toolbarActions,
}) => (
  <GlassCard delay={0} className="p-4">
    {filters && <div className="mb-4">{filters}</div>}
    <DataTable
      columns={columns}
      data={data}
      searchColumn="user.username"
      searchPlaceholder="Search users..."
      server={server}
      pageSize={USERS_PAGE_SIZE}
      enableColumnVisibility
      storageKey="table-visibility-users-page"
      // Hidden by default so the table fits 1440px with its Actions column in view;
      // each is one click away in Columns.
      defaultColumnVisibility={{ email: false, cr_teams: false, hire_date: false }}
      enableRowSelection
      rowSelection={rowSelection}
      onRowSelectionChange={onRowSelectionChange}
      getRowId={(row) => String(row.id)}
      emptyMessage="No users match your filters."
      mobileCard={USER_CARD}
      toolbarActions={toolbarActions}
    />
  </GlassCard>
);
