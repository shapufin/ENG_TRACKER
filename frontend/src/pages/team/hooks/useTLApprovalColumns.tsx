import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { UserCell } from "@/components/admin/UserCell";
import { ApprovalActionsWithView } from "@/components/admin/ApprovalActionsWithView";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import { leaveRequestBaseColumns } from "@/pages/leave_management/hooks/leaveColumnsBase";
import type { OvertimeLog, StandbyLog, LeaveRequest } from "@/types";
import type { AppColumnDef } from "@/components/ui/tableTypes";

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
  const overtimeColumns: AppColumnDef<OvertimeLog>[] = useMemo(
    () => [
      {
        accessorKey: "user_name",
        header: "User",
        size: 150,
        cell: ({ row }) => <UserCell name={row.original.user_name} />,
      },
      { accessorKey: "client_name", header: "Client", size: 110 },
      {
        accessorKey: "date",
        header: "Date",
        size: 108,
        cell: (info) => formatDateDDMMYYYY(info.getValue() as string),
      },
      {
        accessorKey: "hours",
        header: "Hours",
        size: 87,
        cell: ({ row }) => (
          <Badge variant="secondary" className="rounded-full font-mono text-xs">
            {row.original.hours}h
          </Badge>
        ),
      },
      {
        id: "payroll_period",
        header: "Payroll",
        size: 130,
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
      {
        accessorKey: "description",
        header: "Description",
        // Free-text column: the flexible width, truncated with a tooltip. Hidden
        // by default (see TLApprovalTabPanel) so 8 columns fit 1440px.
        size: 120,
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 122,
        cell: (info) => (
          <StatusBadge variant={info.getValue() as "pending" | "approved" | "rejected"} />
        ),
      },
      {
        id: "actions",
        meta: { actionsDisplay: "column" },
        header: "Actions",
        // Sized to the widest row (View + Approve + Reject).
        size: 259,
        cell: (info: { row: { original: OvertimeLog } }) => {
          const row = info.row.original;
          return (
            <ApprovalActionsWithView
              status={row.status}
              itemLabel={row.user_name ?? `overtime request ${row.id}`}
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

  const standbyColumns: AppColumnDef<StandbyLog>[] = useMemo(
    () => [
      {
        accessorKey: "user_name",
        header: "User",
        size: 150,
        cell: ({ row }) => <UserCell name={row.original.user_name} />,
      },
      {
        accessorKey: "date",
        header: "Date",
        size: 108,
        cell: (info) => formatDateDDMMYYYY(info.getValue() as string),
      },
      {
        accessorKey: "hours",
        header: "Hours",
        size: 87,
        cell: ({ row }) => (
          <Badge variant="secondary" className="rounded-full font-mono text-xs">
            {row.original.hours}h
          </Badge>
        ),
      },
      {
        id: "payroll_period",
        header: "Payroll",
        size: 130,
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
      {
        accessorKey: "description",
        header: "Description",
        size: 120,
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 122,
        cell: (info) => (
          <StatusBadge variant={info.getValue() as "pending" | "approved" | "rejected"} />
        ),
      },
      {
        id: "actions",
        meta: { actionsDisplay: "column" },
        header: "Actions",
        size: 259,
        cell: (info: { row: { original: StandbyLog } }) => {
          const row = info.row.original;
          return (
            <ApprovalActionsWithView
              status={row.status}
              itemLabel={row.user_name ?? `standby request ${row.id}`}
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

  const leaveColumns: AppColumnDef<LeaveRequest>[] = useMemo(
    () => [
      ...leaveRequestBaseColumns<LeaveRequest>(),
      { accessorKey: "reason", header: "Reason", size: 120 },
      {
        id: "actions",
        meta: { actionsDisplay: "column" },
        header: "Actions",
        size: 259,
        cell: (info: { row: { original: LeaveRequest } }) => {
          const row = info.row.original;
          return (
            <ApprovalActionsWithView
              status={row.status}
              itemLabel={row.user_name ?? `leave request ${row.id}`}
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
