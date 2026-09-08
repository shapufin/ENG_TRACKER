import React from "react";
import type { RowSelectionState, OnChangeFn } from "@tanstack/react-table";
import { GlassCard } from "@/components/ui/GlassCard";
import { DataTable } from "@/components/ui/DataTable";

interface HoursLogDataTableProps<T extends { id: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: any[];
  data: T[];
  rowSelection: Record<string, boolean>;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  storageKey: string;
  searchColumn?: string;
  searchPlaceholder?: string;
}

export const HoursLogDataTable = <T extends { id: number }>({
  columns,
  data,
  rowSelection,
  onRowSelectionChange,
  storageKey,
  searchColumn,
  searchPlaceholder,
}: HoursLogDataTableProps<T>) => (
  <GlassCard delay={0} className="p-4">
    <DataTable
      columns={columns}
      data={data}
      enableRowSelection
      rowSelection={rowSelection}
      onRowSelectionChange={onRowSelectionChange}
      enableColumnVisibility
      storageKey={storageKey}
      getRowId={(row) => row.id.toString()}
      {...(searchColumn && { searchColumn, searchPlaceholder })}
    />
  </GlassCard>
);
