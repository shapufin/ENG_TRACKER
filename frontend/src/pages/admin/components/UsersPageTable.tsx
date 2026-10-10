import React from "react";
import { DataTable } from "@/components/ui/DataTable";
import { GlassCard } from "@/components/ui/GlassCard";
import type { UserProfile } from "@/types";
import type { RowSelectionState, OnChangeFn } from "@tanstack/react-table";
import type { AppColumnDef } from "@/components/ui/tableTypes";

interface UsersPageTableProps {
  columns: AppColumnDef<UserProfile>[];
  data: UserProfile[];
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  /** Seeds the search box (from ?q=, e.g. the command palette's user result). */
  initialSearch?: string;
  /** Filter strip rendered above the table, inside the same card. */
  filters?: React.ReactNode;
}

export const UsersPageTable: React.FC<UsersPageTableProps> = ({
  columns,
  data,
  rowSelection,
  onRowSelectionChange,
  initialSearch,
  filters,
}) => (
  <GlassCard delay={0} className="p-4">
    {filters && <div className="mb-4">{filters}</div>}
    <DataTable
      columns={columns}
      data={data}
      searchColumn="user.username"
      searchPlaceholder="Search users..."
      initialSearch={initialSearch}
      enableColumnVisibility
      storageKey="table-visibility-users-page"
      defaultColumnVisibility={{ email: false }}
      enableRowSelection
      rowSelection={rowSelection}
      onRowSelectionChange={onRowSelectionChange}
      getRowId={(row) => String(row.id)}
      emptyMessage="No users match your filters."
    />
  </GlassCard>
);
