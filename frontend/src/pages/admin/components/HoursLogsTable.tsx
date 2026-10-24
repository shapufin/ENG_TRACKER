import React, { useMemo, useState } from "react";
import { HOURS_PAGE_SIZE } from "../hooks/useHoursLogsServerData";
import { DataTable } from "@/components/ui/DataTable";
import type { OnChangeFn, RowSelectionState } from "@tanstack/react-table";
import { GlassCard } from "@/components/ui/GlassCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Check, Trash2, X } from "lucide-react";
import { RowActions, type RowAction } from "@/components/ui/RowActions";
import { DescriptionColumn } from "@/components/admin/DescriptionColumn";
import { UserCell } from "@/components/admin/UserCell";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import { OvertimeHoursBadge } from "@/pages/overtime/components/OvertimeHoursBadge";
import type { StatusVariant } from "@/components/ui/StatusBadge";
import type { AppColumnDef } from "@/components/ui/tableTypes";
import type { DataTableServerMode } from "@/components/ui/DataTable";

interface HoursLog {
  id: number;
  user_name?: string;
  user_tech_levels?: string[];
  date: string;
  hours: number;
  paid_window_start?: string | null;
  paid_window_end?: string | null;
  description?: string | null;
  status: string;
}

interface HoursLogsTableProps<T extends HoursLog> {
  logs: T[];
  /** One server-filtered page; the table neither filters nor slices it. */
  server: DataTableServerMode;
  extraColumns?: AppColumnDef<T>[];
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onDelete?: (id: number) => void;
  canDelete?: boolean;
  storageKey: string;
  /** Header strip rendered above the table inside the same GlassCard (two-surface rule). */
  header?: React.ReactNode;
  /** Filters that share the table toolbar row with the Columns menu. */
  toolbar?: React.ReactNode;
  /** Row checkboxes appear only when a selection owner is supplied. */
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
}

const HoursLogRowActions = ({
  id,
  status,
  onApprove,
  onReject,
  onDelete,
}: {
  id: number;
  status: string;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onDelete?: (id: number) => void;
}) => {
  const [open, setOpen] = useState(false);
  const actions: RowAction[] = [];
  if (status === "pending") {
    actions.push(
      { label: `Approve ${id}`, icon: Check, tone: "success", onClick: () => onApprove(id) },
      { label: `Reject ${id}`, icon: X, tone: "danger", onClick: () => onReject(id) }
    );
  }
  if (onDelete) {
    actions.push({
      label: `Delete ${id}`,
      icon: Trash2,
      tone: "danger",
      onClick: () => setOpen(true),
    });
  }
  if (actions.length === 0) return <span className="text-muted-foreground">-</span>;
  return (
    <>
      <RowActions actions={actions} />
      {onDelete && (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Delete Record"
          description="Delete this record? Payroll and approval safeguards still apply."
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={() => {
            setOpen(false);
            onDelete(id);
          }}
        />
      )}
    </>
  );
};

export const HoursLogsTable = <T extends HoursLog>({
  logs,
  server,
  extraColumns = [],
  onApprove,
  onReject,
  onDelete,
  canDelete = false,
  storageKey,
  header,
  toolbar,
  rowSelection,
  onRowSelectionChange,
}: HoursLogsTableProps<T>) => {
  const columns = useMemo<AppColumnDef<T>[]>(
    () => [
      {
        id: "user_name",
        accessorKey: "user_name",
        header: "User",
        cell: ({ row }) => (
          <UserCell name={row.original.user_name} techLevels={row.original.user_tech_levels} />
        ),
      },
      {
        id: "date",
        accessorKey: "date",
        header: "Date",
        cell: ({ row }) => formatDateDDMMYYYY(row.original.date),
      },
      ...extraColumns,
      {
        id: "hours",
        accessorKey: "hours",
        header: "Hours",
        cell: ({ row }) =>
          row.original.paid_window_start ? (
            <OvertimeHoursBadge log={row.original} />
          ) : (
            <Badge variant="secondary" className="rounded-full">
              {row.original.hours}h
            </Badge>
          ),
      },
      {
        id: "description",
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => <DescriptionColumn value={row.original.description} />,
      },
      {
        id: "status",
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge variant={row.original.status as StatusVariant} />,
      },
      {
        id: "actions",
        meta: { actionsDisplay: "column" },
        header: "Actions",
        cell: ({ row }) => (
          <HoursLogRowActions
            id={row.original.id}
            status={row.original.status}
            onApprove={onApprove}
            onReject={onReject}
            onDelete={canDelete ? onDelete : undefined}
          />
        ),
      },
    ],
    [extraColumns, onApprove, onReject, onDelete, canDelete]
  );

  return (
    <GlassCard className="p-4">
      {header && <div className="border-line-subtle mb-4 border-b pb-4">{header}</div>}
      <DataTable
        data={logs}
        server={server}
        pageSize={HOURS_PAGE_SIZE}
        columns={columns}
        enableRowSelection={Boolean(onRowSelectionChange)}
        rowSelection={rowSelection}
        onRowSelectionChange={onRowSelectionChange}
        enableColumnVisibility
        toolbarActions={toolbar}
        storageKey={storageKey}
        getRowId={(row) => row.id.toString()}
      />
    </GlassCard>
  );
};
