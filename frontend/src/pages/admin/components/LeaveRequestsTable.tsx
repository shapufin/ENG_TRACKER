import React, { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { LeaveBalanceBadge } from "@/components/ui/LeaveBalanceBadge";
import { DataTable } from "@/components/ui/DataTable";
import type { OnChangeFn, RowSelectionState } from "@tanstack/react-table";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
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
import type { DataTableServerMode } from "@/components/ui/DataTable";
import { LEAVE_REQUESTS_PAGE_SIZE } from "../hooks/useLeaveRequestsServerData";

interface LeaveRequestsTableProps {
  requests: LeaveRequest[];
  /** One server-filtered page; the table neither filters nor slices it. */
  server: DataTableServerMode;
  onApprove: (id: number) => void;
  onReject: (id: number, reason: string) => void;
  onDelete?: (id: number) => void;
  canDelete?: boolean;
  /** Header strip rendered above the table inside the same GlassCard (two-surface rule). */
  header?: React.ReactNode;
  /** Filters that share the table toolbar row with the Columns menu. */
  toolbar?: React.ReactNode;
  /** Row checkboxes appear only when a selection owner is supplied. */
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
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
  // Approval decisions stay always-visible inline buttons (never hover-revealed
  // icon actions): a pending decision is the row's whole point and must be
  // discoverable without hovering. Only the destructive delete keeps the
  // hover-reveal RowActions treatment.
  const openReject = () => {
    setReason("");
    setRejectOpen(true);
  };
  const deleteAction: RowAction[] = onDelete
    ? [
        {
          label: `Delete ${id}`,
          icon: Trash2,
          tone: "danger",
          onClick: () => setDeleteOpen(true),
        },
      ]
    : [];
  const deleteDialog = onDelete && (
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
  );
  if (status !== "pending") {
    if (deleteAction.length === 0) return <span className="text-muted-foreground">-</span>;
    return (
      <>
        <RowActions actions={deleteAction} />
        {deleteDialog}
      </>
    );
  }
  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <Button type="button" size="sm" aria-label={`Approve ${id}`} onClick={() => onApprove(id)}>
          <Check className="h-4 w-4" aria-hidden="true" />
          Approve
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Reject ${id}`}
          onClick={openReject}
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Reject
        </Button>
        {deleteAction.length > 0 && <RowActions actions={deleteAction} />}
      </div>
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
      {deleteDialog}
    </>
  );
};

export const LeaveRequestsTable: React.FC<LeaveRequestsTableProps> = ({
  requests,
  server,
  onApprove,
  onReject,
  onDelete,
  canDelete = false,
  header,
  toolbar,
  rowSelection,
  onRowSelectionChange,
}) => {
  const columns = useMemo<AppColumnDef<LeaveRequest>[]>(
    () => [
      {
        id: "user_name",
        accessorKey: "user_name",
        header: "User",
        size: 150,
        cell: ({ row }) => <UserCell name={row.original.user_name} />,
      },
      {
        id: "type",
        accessorKey: "type",
        header: "Type",
        size: 104,
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
        size: 150,
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
              <span className="text-muted-foreground text-xs">
                {days} {days === 1 ? "day" : "days"}
              </span>
            </div>
          );
        },
      },
      {
        id: "days",
        accessorKey: "days",
        header: "Days",
        size: 86,
        cell: ({ row }) => (
          <span>
            {row.original.days_requested}{" "}
            {Number(row.original.days_requested) === 1 ? "day" : "days"}
          </span>
        ),
      },
      {
        id: "user_leave_balance",
        accessorKey: "user_leave_balance",
        header: "Balance Left",
        size: 128,
        cell: ({ row }) => <LeaveBalanceBadge balance={row.original.user_leave_balance} />,
      },
      {
        id: "reason",
        accessorKey: "reason",
        header: "Reason",
        // Free-text column: the one flexible width, truncated with a tooltip.
        // Hidden by default (see defaultColumnVisibility) so the table fits 1440px.
        size: 130,
        cell: ({ row }) => <DescriptionColumn value={row.original.reason} />,
      },
      {
        id: "status",
        accessorKey: "status",
        header: "Status",
        size: 127,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cell: ({ row }) => <StatusBadge variant={row.original.status as any} />,
      },
      {
        id: "actions",
        meta: { actionsDisplay: "column" },
        header: "Actions",
        // Sized to the widest row (Approve + Reject + delete icon).
        size: 210,
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
      {header && <div className="border-line-subtle mb-4 border-b pb-4">{header}</div>}
      <DataTable
        data={requests}
        server={server}
        pageSize={LEAVE_REQUESTS_PAGE_SIZE}
        columns={columns}
        enableRowSelection={Boolean(onRowSelectionChange)}
        rowSelection={rowSelection}
        onRowSelectionChange={onRowSelectionChange}
        enableColumnVisibility
        toolbarActions={toolbar}
        storageKey="table-visibility-leave-requests"
        // 8 columns do not fit a 1440px admin viewport at readable widths; the
        // free-text Reason column is hidden by default and stays one click away
        // in the Columns menu (never dropped).
        defaultColumnVisibility={{ reason: false }}
        getRowId={(row) => row.id.toString()}
      />
    </GlassCard>
  );
};
