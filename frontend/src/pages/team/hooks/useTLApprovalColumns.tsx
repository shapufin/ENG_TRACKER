import { StandbyDateCell, StandbyHoursCell } from "@/components/standby/StandbyDayCells";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DescriptionColumn } from "@/components/admin/DescriptionColumn";
import { UserCell } from "@/components/admin/UserCell";
import { TicketIdBadges } from "@/components/ui/TicketIdBadges";
import { ApprovalActionsWithView } from "@/components/admin/ApprovalActionsWithView";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import { leaveRequestBaseColumns } from "@/pages/leave_management/hooks/leaveColumnsBase";
import { OvertimeHoursBadge } from "@/pages/overtime/components/OvertimeHoursBadge";
import type { OvertimeLog, StandbyLog, LeaveRequest } from "@/types";
import type { AppColumnDef } from "@/components/ui/tableTypes";

/** Auto-fit rank of the shared leave base columns (they carry no priority of their own). */
const LEAVE_BASE_PRIORITY: Record<string, 1 | 2 | 3> = {
  user_name: 1,
  request_type: 2,
  start_date: 1,
  end_date: 1,
  days_requested: 1,
  status: 1,
};

const withLeavePriority = (column: AppColumnDef<LeaveRequest>): AppColumnDef<LeaveRequest> => {
  const id = (column as { accessorKey?: string }).accessorKey ?? "";
  return { ...column, id, meta: { ...column.meta, priority: LEAVE_BASE_PRIORITY[id] ?? 1 } };
};

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
        id: "user_name",
        accessorKey: "user_name",
        meta: { priority: 1 },
        header: "User",
        size: 150,
        cell: ({ row }) => <UserCell name={row.original.user_name} />,
      },
      {
        id: "client_name",
        accessorKey: "client_name",
        header: "Client",
        size: 110,
        meta: { priority: 2 },
      },
      {
        id: "ticket_references",
        meta: { priority: 3 },
        header: "Ticket ID",
        size: 130,
        accessorFn: (row) => row.ticket_references?.join(", ") ?? "",
        cell: ({ row }) => <TicketIdBadges references={row.original.ticket_references} />,
      },
      {
        id: "date",
        accessorKey: "date",
        meta: { priority: 1 },
        header: "Date",
        size: 110,
        cell: (info) => formatDateDDMMYYYY(info.getValue() as string),
      },
      {
        id: "hours",
        accessorKey: "hours",
        meta: { priority: 1 },
        header: "Hours",
        size: 130,
        cell: ({ row }) => <OvertimeHoursBadge log={row.original} />,
      },
      {
        id: "payroll_period",
        meta: { priority: 3 },
        header: "Payroll",
        size: 110,
        cell: ({ row }) =>
          row.original.is_carried_over ? (
            <Badge
              variant="outline"
              className="whitespace-nowrap"
              title={`Submitted: ${row.original.submitted_at ?? "server timestamp"}`}
            >
              Next month
            </Badge>
          ) : (
            <span className="text-muted-foreground whitespace-nowrap">Same month</span>
          ),
      },
      {
        id: "description",
        accessorKey: "description",
        meta: { priority: 3, truncate: true },
        header: "Description",
        // Free-text column: the flexible width, truncated with a tooltip/popover.
        // Hidden by default (see TLApprovalTabPanel) so 8 columns fit 1440px.
        size: 120,
        cell: ({ row }) => <DescriptionColumn value={row.original.description} />,
      },
      {
        id: "status",
        accessorKey: "status",
        meta: { priority: 1 },
        header: "Status",
        size: 115,
        cell: (info) => (
          <StatusBadge variant={info.getValue() as "pending" | "approved" | "rejected"} />
        ),
      },
      {
        id: "actions",
        meta: { priority: 1, actionsDisplay: "column" },
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
        id: "user_name",
        accessorKey: "user_name",
        meta: { priority: 1 },
        header: "User",
        size: 150,
        cell: ({ row }) => <UserCell name={row.original.user_name} />,
      },
      {
        id: "date",
        accessorKey: "date",
        meta: { priority: 1 },
        header: "Date",
        size: 110,
        cell: StandbyDateCell,
      },
      {
        id: "hours",
        accessorKey: "hours",
        meta: { priority: 1 },
        header: "Hours",
        size: 150,
        cell: StandbyHoursCell,
      },
      {
        id: "payroll_period",
        meta: { priority: 3 },
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
        id: "description",
        accessorKey: "description",
        meta: { priority: 3, truncate: true },
        header: "Description",
        size: 120,
        cell: ({ row }) => <DescriptionColumn value={row.original.description} />,
      },
      {
        id: "status",
        accessorKey: "status",
        meta: { priority: 1 },
        header: "Status",
        size: 115,
        cell: (info) => (
          <StatusBadge variant={info.getValue() as "pending" | "approved" | "rejected"} />
        ),
      },
      {
        id: "actions",
        meta: { priority: 1, actionsDisplay: "column" },
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
      ...leaveRequestBaseColumns<LeaveRequest>().map(withLeavePriority),
      {
        id: "reason",
        accessorKey: "reason",
        meta: { priority: 3, truncate: true },
        header: "Reason",
        size: 120,
        cell: ({ row }) => <DescriptionColumn value={row.original.reason} />,
      },
      {
        id: "actions",
        meta: { priority: 1, actionsDisplay: "column" },
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
