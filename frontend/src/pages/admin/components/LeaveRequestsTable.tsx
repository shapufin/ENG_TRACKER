import React, { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { LeaveBalanceBadge } from "@/components/ui/LeaveBalanceBadge";
import { DataTable } from "@/components/ui/DataTable";
import { GlassCard } from "@/components/ui/GlassCard";
import { Sun, Stethoscope, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import { differenceInCalendarDays } from "date-fns";
import { ApprovalActionsColumn } from "@/components/admin/ApprovalActionsColumn";
import { DescriptionColumn } from "@/components/admin/DescriptionColumn";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { UserCell } from "@/components/admin/UserCell";
import type { ColumnDef } from "@tanstack/react-table";
import type { LeaveRequest } from "@/types";

interface LeaveRequestsTableProps {
  requests: LeaveRequest[];
  onApprove: (id: number) => void;
  onReject: (id: number, reason: string) => void;
  onDelete?: (id: number) => void;
  canDelete?: boolean;
}

const DeleteLeaveRequestButton = ({
  id,
  onDelete,
}: {
  id: number;
  onDelete: (id: number) => void;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive"
        title="Delete leave request"
        aria-label="Delete leave request"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete Leave Request"
        description="Delete this leave request? Its balance will be restored."
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

export const LeaveRequestsTable: React.FC<LeaveRequestsTableProps> = ({
  requests,
  onApprove,
  onReject,
  onDelete,
  canDelete = false,
}) => {
  const columns = useMemo<ColumnDef<LeaveRequest>[]>(
    () => [
      {
        id: "user_name",
        accessorKey: "user_name",
        header: "User",
        cell: ({ row }) => <UserCell name={row.original.user_name} />,
      },
      {
        id: "type",
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant={row.original.request_type === "vacation" ? "default" : "secondary"}>
            {row.original.request_type === "vacation" ? (
              <Sun className="mr-1 h-3 w-3" />
            ) : (
              <Stethoscope className="mr-1 h-3 w-3" />
            )}
            {row.original.request_type === "vacation" ? "Vacation" : "Sick Leave"}
          </Badge>
        ),
      },
      {
        id: "dates",
        accessorKey: "dates",
        header: "Period",
        cell: ({ row }) => {
          const start = formatDateDDMMYYYY(row.original.start_date);
          const end = formatDateDDMMYYYY(row.original.end_date);
          const days =
            differenceInCalendarDays(
              new Date(row.original.end_date),
              new Date(row.original.start_date)
            ) + 1;
          return (
            <div className="flex flex-col">
              <span className="text-sm">
                {start} → {end}
              </span>
              <span className="text-xs text-muted-foreground">{days} days</span>
            </div>
          );
        },
      },
      {
        id: "days",
        accessorKey: "days",
        header: "Days",
        cell: ({ row }) => <span>{row.original.days_requested} days</span>,
      },
      {
        id: "user_leave_balance",
        accessorKey: "user_leave_balance",
        header: "Balance Left",
        cell: ({ row }) => <LeaveBalanceBadge balance={row.original.user_leave_balance} />,
      },
      {
        id: "reason",
        accessorKey: "reason",
        header: "Reason",
        cell: ({ row }) => <DescriptionColumn value={row.original.reason} />,
      },
      {
        id: "status",
        accessorKey: "status",
        header: "Status",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cell: ({ row }) => <StatusBadge variant={row.original.status as any} />,
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <ApprovalActionsColumn
              status={row.original.status}
              onApprove={() => onApprove(row.original.id)}
              onReject={() => {
                const reason = prompt("Enter rejection reason:") || "";
                if (reason) onReject(row.original.id, reason);
              }}
            />
            {canDelete && onDelete && (
              <DeleteLeaveRequestButton id={row.original.id} onDelete={onDelete} />
            )}
          </div>
        ),
      },
    ],
    [onApprove, onReject, onDelete, canDelete]
  );

  return (
    <GlassCard className="p-4">
      <DataTable
        data={requests}
        columns={columns}
        enableColumnVisibility
        storageKey="table-visibility-leave-requests"
        getRowId={(row) => row.id.toString()}
      />
    </GlassCard>
  );
};
