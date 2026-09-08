import React from "react";
import { DataTable } from "@/components/ui/DataTable";
import { GlassCard } from "@/components/ui/GlassCard";
import type { UserProfile } from "@/types";
import type { RowSelectionState, ColumnDef, OnChangeFn } from "@tanstack/react-table";

interface UsersPageTableProps {
  columns: ColumnDef<UserProfile>[];
  data: UserProfile[];
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
}

export const UsersPageTable: React.FC<UsersPageTableProps> = ({
  columns,
  data,
  rowSelection,
  onRowSelectionChange,
}) => (
  <GlassCard delay={0} className="p-4">
    <DataTable
      columns={columns}
      data={data}
      searchColumn="user.username"
      searchPlaceholder="Search users..."
      enableColumnVisibility
      storageKey="table-visibility-users-page"
      enableRowSelection
      rowSelection={rowSelection}
      onRowSelectionChange={onRowSelectionChange}
      getRowId={(row) => String(row.id)}
      emptyMessage="No users match your filters."
    />
  </GlassCard>
);
