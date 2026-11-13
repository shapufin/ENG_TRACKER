import { useMemo } from "react";
import { leaveDaysLabel } from "@/components/leave/leaveDuration";
import { Badge } from "@/components/ui/badge";
import { LeaveBalanceBadge } from "@/components/ui/LeaveBalanceBadge";
import { StatusBadge, type StatusVariant } from "@/components/ui/StatusBadge";
import { UserCell } from "@/components/admin/UserCell";
import { TicketIdBadges } from "@/components/ui/TicketIdBadges";
import { createViewApproveRejectActionsColumn } from "@/components/ui/tableColumnHelpers";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import { OvertimeHoursBadge } from "@/pages/overtime/components/OvertimeHoursBadge";
import type { OvertimeLog, StandbyLog, LeaveRequest } from "@/types";
import type { AppColumnDef } from "@/components/ui/tableTypes";

export const useTeamColumns = (
  onView: (record: OvertimeLog | StandbyLog | LeaveRequest) => void,
  onReject: (id: number, type: "overtime" | "standby" | "leave") => void,
  otApprove: { mutate: (id: number) => void; isPending: boolean },
  otReject: { mutate: (payload: { id: number; reason: string }) => void; isPending: boolean },
  sbApprove: { mutate: (id: number) => void; isPending: boolean },
  sbReject: { mutate: (payload: { id: number; reason: string }) => void; isPending: boolean },
  leaveApprove: { mutate: (id: number) => void; isPending: boolean },
  leaveReject: { mutate: (payload: { id: number; reason: string }) => void; isPending: boolean }
) => {
  const getOvertimeColumns = useMemo<AppColumnDef<OvertimeLog>[]>(
    () => [
      {
        accessorKey: "user_name",
        header: "Employee",
        size: 170,
        meta: { flex: true },
        cell: ({ row }) => (
          <UserCell
            name={row.original.user_full_name || row.original.user_name}
            subtitle={row.original.user_code}
          />
        ),
      },
      {
        accessorKey: "date",
        header: "Date",
        size: 95,
        meta: { flex: true },
        cell: ({ row }) => formatDateDDMMYYYY(row.original.date),
      },
      {
        accessorKey: "hours",
        header: "Hours",
        size: 130,
        meta: { flex: true },
        cell: ({ row }) => <OvertimeHoursBadge log={row.original} />,
      },
      {
        id: "payroll_period",
        header: "Payroll",
        size: 110,
        meta: { flex: true },
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
        accessorKey: "client_name",
        header: "Client",
        size: 110,
        meta: { flex: true },
        cell: ({ row }) => row.original.client_name || "-",
      },
      {
        id: "ticket_references",
        header: "Ticket ID",
        size: 130,
        meta: { flex: true },
        accessorFn: (row) => row.ticket_references?.join(", ") ?? "",
        cell: ({ row }) => <TicketIdBadges references={row.original.ticket_references} />,
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 95,
        meta: { flex: true },
        cell: ({ row }) => <StatusBadge variant={row.original.status as StatusVariant} />,
      },
      {
        ...createViewApproveRejectActionsColumn<OvertimeLog>({
          onView,
          approveMutate: (id) => otApprove.mutate(id),
          approvePending: otApprove.isPending,
          onReject: (id) => onReject(id, "overtime"),
          rejectPending: otReject.isPending,
        }),
        // Widest row: view + approve + reject icons.
        size: 150,
      },
    ],
    [onView, onReject, otApprove, otReject]
  );

  const getStandbyColumns = useMemo<AppColumnDef<StandbyLog>[]>(
    () => [
      {
        accessorKey: "user_name",
        header: "Employee",
        size: 170,
        meta: { flex: true },
        cell: ({ row }) => (
          <UserCell
            name={row.original.user_full_name || row.original.user_name}
            subtitle={row.original.user_code}
          />
        ),
      },
      {
        accessorKey: "date",
        header: "Date",
        size: 95,
        meta: { flex: true },
        cell: ({ row }) => formatDateDDMMYYYY(row.original.date),
      },
      {
        accessorKey: "hours",
        header: "Hours",
        size: 100,
        meta: { flex: true },
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
        meta: { flex: true },
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
        accessorKey: "status",
        header: "Status",
        size: 95,
        meta: { flex: true },
        cell: ({ row }) => <StatusBadge variant={row.original.status as StatusVariant} />,
      },
      {
        ...createViewApproveRejectActionsColumn<StandbyLog>({
          onView,
          approveMutate: (id) => sbApprove.mutate(id),
          approvePending: sbApprove.isPending,
          onReject: (id) => onReject(id, "standby"),
          rejectPending: sbReject.isPending,
        }),
        size: 150,
      },
    ],
    [onView, onReject, sbApprove, sbReject]
  );

  const getLeaveColumns = useMemo<AppColumnDef<LeaveRequest>[]>(
    () => [
      {
        accessorKey: "user_name",
        header: "Employee",
        size: 170,
        meta: { flex: true },
        cell: ({ row }) => (
          <UserCell
            name={row.original.user_full_name || row.original.user_name}
            subtitle={row.original.user_code}
          />
        ),
      },
      {
        accessorKey: "start_date",
        header: "Start Date",
        size: 105,
        meta: { flex: true },
        cell: ({ row }) => formatDateDDMMYYYY(row.original.start_date),
      },
      {
        accessorKey: "end_date",
        header: "End Date",
        size: 105,
        meta: { flex: true },
        cell: ({ row }) => formatDateDDMMYYYY(row.original.end_date),
      },
      {
        accessorKey: "days_requested",
        header: "Days",
        size: 85,
        meta: { flex: true },
        cell: ({ row }) => leaveDaysLabel(row.original),
      },
      {
        accessorKey: "user_leave_balance",
        header: "Balance Left",
        size: 115,
        meta: { flex: true },
        cell: ({ row }) => <LeaveBalanceBadge balance={row.original.user_leave_balance} />,
      },
      {
        accessorKey: "request_type",
        header: "Type",
        size: 104,
        meta: { flex: true },
        cell: ({ row }) => (
          <Badge variant={row.original.request_type === "vacation" ? "default" : "secondary"}>
            {row.original.request_type === "vacation" ? "Vacation" : "Sick Leave"}
          </Badge>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 95,
        meta: { flex: true },
        cell: ({ row }) => <StatusBadge variant={row.original.status as StatusVariant} />,
      },
      {
        ...createViewApproveRejectActionsColumn<LeaveRequest>({
          onView,
          approveMutate: (id) => leaveApprove.mutate(id),
          approvePending: leaveApprove.isPending,
          onReject: (id) => onReject(id, "leave"),
          rejectPending: leaveReject.isPending,
        }),
        size: 150,
      },
    ],
    [onView, onReject, leaveApprove, leaveReject]
  );

  return { getOvertimeColumns, getStandbyColumns, getLeaveColumns };
};
