import React, { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { LeaveBalanceBadge } from "@/components/ui/LeaveBalanceBadge";
import { DataTable } from "@/components/ui/DataTable";
import { GlassCard } from "@/components/ui/GlassCard";
import { Check, Sun, Stethoscope, Trash2, X } from "lucide-react";
import { RowActions, type RowAction } from "@/components/ui/RowActions";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import { differenceInCalendarDays } from "date-fns";
import { DescriptionColumn } from "@/components/admin/DescriptionColumn";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { UserCell } from "@/components/admin/UserCell";
import type { AppColumnDef } from "@/components/ui/tableTypes";
import type { LeaveRequest } from "@/types";

interface LeaveRequestsTableProps {
  requests: LeaveRequest[];
  onApprove: (id: number) => void;
  onReject: (id: number, reason: string) => void;
  onDelete?: (id: number) => void;
  canDelete?: boolean;
}

const LeaveRequestRowActions = ({
  id,
  status,
  onApprove,
  onReject,
  onDelete,
}: {
  id: number;
  status: string;
  onApprove: (id: number) => void;
  onReject: (id: number, reason: string) => void;
  onDelete?: (id: number) => void;
}) => {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reason, setReason] = useState("");
  const actions: RowAction[] = [];
  if (status === "pending") {
    actions.push(
      { label: `Approve ${id}`, icon: Check, tone: "success", onClick: () => onApprove(id) },
      {
        label: `Reject ${id}`,
        icon: X,
        tone: "danger",
        onClick: () => {
          setReason("");
          setRejectOpen(true);
        },
      }
    );
  }
  if (onDelete) {
    actions.push({
      label: `Delete ${id}`,
      icon: Trash2,
      tone: "danger",
      onClick: () => setDeleteOpen(true),
    });
  }
  if (actions.length === 0) return <span className="text-muted-foreground">-</span>;
  return (
    <>
      <RowActions actions={actions} />
      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="Reject Request"
        description="Provide a reason for rejection:"
        icon={<X className="h-4 w-4" />}
        onConfirm={() => {
          setRejectOpen(false);
          onReject(id, reason);
        }}
        confirmLabel="Reject"
        variant="destructive"
      >
        <div className="pt-2">
          <Input
            placeholder="Rejection reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </ConfirmDialog>
      {onDelete && (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="Delete Leave Request"
          description="Delete this leave request? Its balance will be restored."
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={() => {
            setDeleteOpen(false);
            onDelete(id);
          }}
        />
      )}
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
  const columns = useMemo<AppColumnDef<LeaveRequest>[]>(
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
          <LeaveRequestRowActions
            id={row.original.id}
            status={row.original.status}
            onApprove={onApprove}
            onReject={onReject}
            onDelete={canDelete ? onDelete : undefined}
          />
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
