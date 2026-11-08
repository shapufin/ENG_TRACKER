import React from "react";
import type { RowSelectionState, OnChangeFn } from "@tanstack/react-table";
import { GlassCard } from "@/components/ui/GlassCard";
import { DataTable } from "@/components/ui/DataTable";
import type { DataTableCardSpec } from "@/components/ui/DataTableCards";
import { FilterChipRow } from "@/components/ui/FilterChipRow";

interface HoursLogDataTableProps<T extends { id: number; status?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: any[];
  data: T[];
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  storageKey: string;
  searchColumn?: string;
  searchPlaceholder?: string;
  /** Extra toolbar controls rendered on the same row as Search and Columns. */
  toolbarActions?: React.ReactNode;
  /** Phone card layout (below 768px); pages opt in by naming their column ids. */
  mobileCard?: DataTableCardSpec;
  /** Row/card tap (the pages open the record detail on phones only). */
  onRowClick?: (row: T) => void;
}

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
] as const;

export const HoursLogDataTable = <T extends { id: number; status?: string }>({
  columns,
  data,
  rowSelection,
  onRowSelectionChange,
  storageKey,
  searchColumn,
  searchPlaceholder,
  toolbarActions,
  mobileCard,
  onRowClick,
}: HoursLogDataTableProps<T>) => {
  const [status, setStatus] = React.useState<string | null>(null);
  const options = STATUS_OPTIONS.map((o) => ({
    ...o,
    count: data.filter((r) => r.status === o.value).length,
  }));
  const rows = status ? data.filter((r) => r.status === status) : data;

  // Selection must never reference rows the filter hides (bulk delete would act on them).
  const toggleStatus = (value: string) => {
    setStatus((current) => (current === value ? null : value));
    onRowSelectionChange({});
  };

  return (
    <GlassCard delay={0} className="p-4">
      <div className="border-line-subtle mb-4 border-b pb-4">
        <FilterChipRow
          label="Status"
          options={options}
          selected={status ? [status] : []}
          onToggle={toggleStatus}
        />
      </div>
      <DataTable
        columns={columns}
        data={rows}
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={onRowSelectionChange}
        enableColumnVisibility
        storageKey={storageKey}
        getRowId={(row) => row.id.toString()}
        toolbarActions={toolbarActions}
        mobileCard={mobileCard}
        onRowClick={onRowClick}
        {...(searchColumn && { searchColumn, searchPlaceholder })}
      />
    </GlassCard>
  );
};
