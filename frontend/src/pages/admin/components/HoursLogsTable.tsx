import React, { useMemo, useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { GlassCard } from "@/components/ui/GlassCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Trash2 } from "lucide-react";
import { ApprovalActionsColumn } from "@/components/admin/ApprovalActionsColumn";
import { DescriptionColumn } from "@/components/admin/DescriptionColumn";
import { UserCell } from "@/components/admin/UserCell";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import type { StatusVariant } from "@/components/ui/StatusBadge";
import type { ColumnDef } from "@tanstack/react-table";

interface HoursLog {
  id: number;
  user_name?: string;
  date: string;
  hours: number;
  description?: string | null;
  status: string;
}

interface HoursLogsTableProps<T extends HoursLog> {
  logs: T[];
  extraColumns?: ColumnDef<T>[];
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onDelete?: (id: number) => void;
  canDelete?: boolean;
  storageKey: string;
}

const DeleteLogButton = ({ id, onDelete }: { id: number; onDelete: (id: number) => void }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive"
        title="Delete record"
        aria-label="Delete record"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
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
    </>
  );
};

export const HoursLogsTable = <T extends HoursLog>({
  logs,
  extraColumns = [],
  onApprove,
  onReject,
  onDelete,
  canDelete = false,
  storageKey,
}: HoursLogsTableProps<T>) => {
  const columns = useMemo<ColumnDef<T>[]>(
    () => [
      {
        id: "user_name",
        accessorKey: "user_name",
        header: "User",
        cell: ({ row }) => <UserCell name={row.original.user_name} />,
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
        cell: ({ row }) => (
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
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <ApprovalActionsColumn
              status={row.original.status}
              onApprove={() => onApprove(row.original.id)}
              onReject={() => onReject(row.original.id)}
            />
            {canDelete && onDelete && <DeleteLogButton id={row.original.id} onDelete={onDelete} />}
          </div>
        ),
      },
    ],
    [extraColumns, onApprove, onReject, onDelete, canDelete]
  );

  return (
    <GlassCard className="p-4">
      <DataTable
        data={logs}
        columns={columns}
        enableColumnVisibility
        storageKey={storageKey}
        getRowId={(row) => row.id.toString()}
      />
    </GlassCard>
  );
};
