import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { DataTable } from "@/components/ui/DataTable";
import { TLBulkActions } from "@/components/team/TLBulkActions";
import type { RowSelectionState } from "@tanstack/react-table";

type Tab = "overtime" | "standby" | "leave";

interface TLApprovalTabPanelProps {
  type: Tab;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[];
  isLoading: boolean;
  error: Error | null;
  onRefetch: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: any[];
  rowSelection: RowSelectionState;
  onRowSelectionChange: (
    updater: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)
  ) => void;
  selectedCount: number;
  onClearSelection: () => void;
  onBulkApprove: () => void;
  onBulkReject: () => void;
  isBulkPending: boolean;
  /** Header strip rendered above the table inside the same GlassCard (two-surface rule). */
  header?: React.ReactNode;
  /** Persisted column-visibility key for this tab's table. */
  storageKey: string;
  /** Columns hidden on first load (still one click away in the Columns menu). */
  defaultColumnVisibility?: Record<string, boolean>;
}

export const TLApprovalTabPanel: React.FC<TLApprovalTabPanelProps> = ({
  type,
  label,
  data,
  isLoading,
  error,
  onRefetch,
  columns,
  rowSelection,
  onRowSelectionChange,
  selectedCount,
  onClearSelection,
  onBulkApprove,
  onBulkReject,
  isBulkPending,
  header,
  storageKey,
  defaultColumnVisibility,
}) => {
  return (
    <GlassCard delay={0.2} className="overflow-hidden">
      <div className="p-4">
        {header && <div className="border-line-subtle mb-4 border-b pb-4">{header}</div>}
        <TLBulkActions
          type={type}
          entityLabel={label}
          selectedCount={selectedCount}
          onClear={onClearSelection}
          onApprove={onBulkApprove}
          onReject={onBulkReject}
          isPending={isBulkPending}
        />
        {error ? (
          <ErrorCard message={error.message || `Failed to load ${label}`} onRetry={onRefetch} />
        ) : isLoading ? (
          <LoadingCard />
        ) : (
          <DataTable
            data={data}
            columns={columns}
            enableRowSelection
            rowSelection={rowSelection}
            onRowSelectionChange={onRowSelectionChange}
            enableColumnVisibility
            storageKey={storageKey}
            defaultColumnVisibility={defaultColumnVisibility}
          />
        )}
      </div>
    </GlassCard>
  );
};
