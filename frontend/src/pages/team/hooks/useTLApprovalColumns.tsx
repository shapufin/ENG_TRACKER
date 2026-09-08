import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ApprovalActionsWithView } from "@/components/admin/ApprovalActionsWithView";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import { leaveRequestBaseColumns } from "@/pages/leave_management/hooks/leaveColumnsBase";
import type { OvertimeLog, StandbyLog, LeaveRequest } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";

type Tab = "overtime" | "standby" | "leave";

interface UseTLApprovalColumnsOptions {
  onView: (record: OvertimeLog | StandbyLog | LeaveRequest) => void;
  onApprove: (type: Tab, id: number) => void;
  onReject: (id: number, type: Tab) => void;
}

export const useTLApprovalColumns = ({
  onView,
  onApprove,
  onReject,
}: UseTLApprovalColumnsOptions) => {
  const overtimeColumns: ColumnDef<OvertimeLog>[] = useMemo(
    () => [
      { accessorKey: "user_name", header: "User" },
      { accessorKey: "client_name", header: "Client" },
      {
        accessorKey: "date",
        header: "Date",
        cell: (info) => formatDateDDMMYYYY(info.getValue() as string),
      },
      { accessorKey: "hours", header: "Hours" },
      {
        id: "payroll_period",
        header: "Payroll",
        cell: ({ row }) =>
          row.original.is_carried_over ? (
            <Badge
              variant="outline"
              title={`Submitted: ${row.original.submitted_at ?? "server timestamp"}`}
            >
              Carried to {row.original.requested_period_label ?? "next"}
            </Badge>
          ) : (
            <span className="text-muted-foreground">Same month</span>
          ),
      },
      { accessorKey: "description", header: "Description" },
      {
        accessorKey: "status",
        header: "Status",
        cell: (info) => (
          <StatusBadge variant={info.getValue() as "pending" | "approved" | "rejected"} />
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: (info: { row: { original: OvertimeLog } }) => {
          const row = info.row.original;
          return (
            <ApprovalActionsWithView
              status={row.status}
              onView={() => onView(row)}
              onApprove={() => onApprove("overtime", row.id)}
              onReject={() => onReject(row.id, "overtime")}
            />
          );
        },
      },
    ],
    [onView, onApprove, onReject]
  );

  const standbyColumns: ColumnDef<StandbyLog>[] = useMemo(
    () => [
      { accessorKey: "user_name", header: "User" },
      {
        accessorKey: "date",
        header: "Date",
        cell: (info) => formatDateDDMMYYYY(info.getValue() as string),
      },
      { accessorKey: "hours", header: "Hours" },
      {
        id: "payroll_period",
        header: "Payroll",
        cell: ({ row }) =>
          row.original.is_carried_over ? (
            <Badge
              variant="outline"
              title={`Submitted: ${row.original.submitted_at ?? "server timestamp"}`}
            >
              Carried to {row.original.requested_period_label ?? "next"}
            </Badge>
          ) : (
            <span className="text-muted-foreground">Same month</span>
          ),
      },
      { accessorKey: "description", header: "Description" },
      {
        accessorKey: "status",
        header: "Status",
        cell: (info) => (
          <StatusBadge variant={info.getValue() as "pending" | "approved" | "rejected"} />
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: (info: { row: { original: StandbyLog } }) => {
          const row = info.row.original;
          return (
            <ApprovalActionsWithView
              status={row.status}
              onView={() => onView(row)}
              onApprove={() => onApprove("standby", row.id)}
              onReject={() => onReject(row.id, "standby")}
            />
          );
        },
      },
    ],
    [onView, onApprove, onReject]
  );

  const leaveColumns: ColumnDef<LeaveRequest>[] = useMemo(
    () => [
      ...leaveRequestBaseColumns<LeaveRequest>(),
      { accessorKey: "reason", header: "Reason" },
      {
        id: "actions",
        header: "Actions",
        cell: (info: { row: { original: LeaveRequest } }) => {
          const row = info.row.original;
          return (
            <ApprovalActionsWithView
              status={row.status}
              onView={() => onView(row)}
              onApprove={() => onApprove("leave", row.id)}
              onReject={() => onReject(row.id, "leave")}
            />
          );
        },
      },
    ],
    [onView, onApprove, onReject]
  );

  return { overtimeColumns, standbyColumns, leaveColumns };
};
