import { StandbyDateCell, StandbyHoursCell } from "@/components/standby/StandbyDayCells";
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
import type { DayGroupedOvertimeLog } from "@/lib/overtimeDayGroups";
import type { StandbyRotationLog } from "@/lib/standbyDayGroups";
import type { OvertimeLog, StandbyLog, LeaveRequest } from "@/types";
import type { AppColumnDef } from "@/components/ui/tableTypes";

function renderGroupStatus<
  T extends {
    status: string;
    blocks?: readonly { status: string }[];
    segments?: readonly { status: string }[];
  },
>(row: T) {
  const children = row.blocks ?? row.segments;
  if (children && children.length > 1) {
    const pendingCount = children.filter((c) => c.status === "pending").length;
    if (pendingCount > 0 && pendingCount < children.length) {
      return <StatusBadge variant="pending" label={`${pendingCount}/${children.length} pending`} />;
    }
  }
  return <StatusBadge variant={row.status as StatusVariant} />;
}

export const useTeamColumns = (
  onView: (record: OvertimeLog | StandbyLog | LeaveRequest) => void,
  onReject: (id: number, type: "overtime" | "standby" | "leave") => void,
  otApprove: { mutate: (id: number) => void; isPending: boolean },
  otReject: { mutate: (payload: { id: number; reason: string }) => void; isPending: boolean },
  sbApprove: { mutate: (id: number) => void; isPending: boolean },
  sbReject: { mutate: (payload: { id: number; reason: string }) => void; isPending: boolean },
  leaveApprove: { mutate: (id: number) => void; isPending: boolean },
  leaveReject: { mutate: (payload: { id: number; reason: string }) => void; isPending: boolean },
  isRangeMode: boolean = false
) => {
  const getOvertimeColumns = useMemo<AppColumnDef<OvertimeLog>[]>(
    () => [
      {
        id: "user_name",
        accessorKey: "user_name",
        header: "Employee",
        size: 170,
        meta: { priority: 1, flex: true },
        cell: ({ row }) => (
          <UserCell
            name={row.original.user_full_name || row.original.user_name}
            subtitle={row.original.user_code}
          />
        ),
      },
      {
        id: "date",
        accessorKey: "date",
        header: "Date",
        size: 110,
        meta: { priority: 1, flex: true },
        cell: ({ row }) => formatDateDDMMYYYY(row.original.date),
      },
      {
        id: "hours",
        accessorKey: "hours",
        header: "Hours",
        size: 130,
        meta: { priority: 1, flex: true },
        cell: ({ row }) => <OvertimeHoursBadge log={row.original} />,
      },
      ...(isRangeMode
        ? [
            {
              id: "blocks",
              header: "Blocks",
              size: 165,
              meta: { priority: 3, flex: true },
              cell: ({ row }: { row: { original: DayGroupedOvertimeLog } }) => {
                const blocks = row.original.blocks;
                if (!blocks || blocks.length <= 1) {
                  return <span className="text-muted-foreground text-xs">1 block</span>;
                }
                return (
                  <div className="flex flex-wrap items-center gap-1">
                    {blocks.map((b) => (
                      <Badge
                        key={b.id}
                        variant="outline"
                        className="font-mono text-xs tabular-nums"
                      >
                        {Number(b.hours)}h
                      </Badge>
                    ))}
                  </div>
                );
              },
            } satisfies AppColumnDef<OvertimeLog>,
          ]
        : []),
      {
        id: "payroll_period",
        header: "Payroll",
        size: 150,
        meta: { priority: 3, flex: true },
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
        id: "client_name",
        accessorKey: "client_name",
        header: "Client",
        size: 120,
        meta: { priority: 2, flex: true },
        cell: ({ row }) => row.original.client_name || "-",
      },
      {
        id: "ticket_references",
        header: "Ticket ID",
        size: 130,
        meta: { priority: 3, flex: true },
        accessorFn: (row) => row.ticket_references?.join(", ") ?? "",
        cell: ({ row }) => <TicketIdBadges references={row.original.ticket_references} />,
      },
      {
        id: "status",
        accessorKey: "status",
        header: "Status",
        size: 115,
        meta: { priority: 1, flex: true },
        cell: ({ row }) => renderGroupStatus(row.original as DayGroupedOvertimeLog),
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
        meta: { actionsDisplay: "column", priority: 1 },
      },
    ],
    [onView, onReject, otApprove, otReject, isRangeMode]
  );

  const getStandbyColumns = useMemo<AppColumnDef<StandbyLog>[]>(
    () => [
      {
        id: "user_name",
        accessorKey: "user_name",
        header: "Employee",
        size: 170,
        meta: { priority: 1, flex: true },
        cell: ({ row }) => (
          <UserCell
            name={row.original.user_full_name || row.original.user_name}
            subtitle={row.original.user_code}
          />
        ),
      },
      {
        id: "date",
        accessorKey: "date",
        header: "Date",
        size: 110,
        meta: { priority: 1, flex: true },
        cell: StandbyDateCell,
      },
      {
        id: "hours",
        accessorKey: "hours",
        header: "Hours",
        size: 120,
        meta: { priority: 1, flex: true },
        cell: StandbyHoursCell,
      },
      ...(isRangeMode
        ? [
            {
              id: "breakdown",
              header: "Rotation",
              size: 185,
              meta: { priority: 2, flex: true },
              cell: ({ row }: { row: { original: StandbyRotationLog } }) => {
                const { day_count, date_end, breakdown } = row.original;
                if (!day_count || day_count <= 1) {
                  return <span className="text-muted-foreground text-xs">1 day</span>;
                }
                return (
                  <div className="space-y-0.5 text-xs">
                    <div className="font-medium tabular-nums">
                      {day_count}d · {formatDateDDMMYYYY(row.original.date)}–
                      {date_end ? formatDateDDMMYYYY(date_end) : ""}
                    </div>
                    {breakdown && (
                      <div className="text-muted-foreground font-mono tabular-nums">
                        {breakdown}
                      </div>
                    )}
                  </div>
                );
              },
            } satisfies AppColumnDef<StandbyLog>,
          ]
        : []),
      {
        id: "payroll_period",
        header: "Payroll",
        size: 130,
        meta: { priority: 3, flex: true },
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
        id: "status",
        accessorKey: "status",
        header: "Status",
        size: 115,
        meta: { priority: 1, flex: true },
        cell: ({ row }) => renderGroupStatus(row.original as StandbyRotationLog),
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
        meta: { actionsDisplay: "column", priority: 1 },
      },
    ],
    [onView, onReject, sbApprove, sbReject, isRangeMode]
  );

  const getLeaveColumns = useMemo<AppColumnDef<LeaveRequest>[]>(
    () => [
      {
        id: "user_name",
        accessorKey: "user_name",
        header: "Employee",
        size: 170,
        meta: { priority: 1, flex: true },
        cell: ({ row }) => (
          <UserCell
            name={row.original.user_full_name || row.original.user_name}
            subtitle={row.original.user_code}
          />
        ),
      },
      {
        id: "start_date",
        accessorKey: "start_date",
        header: "Start Date",
        size: 110,
        meta: { priority: 1, flex: true },
        cell: ({ row }) => formatDateDDMMYYYY(row.original.start_date),
      },
      {
        id: "end_date",
        accessorKey: "end_date",
        header: "End Date",
        size: 110,
        meta: { priority: 1, flex: true },
        cell: ({ row }) => formatDateDDMMYYYY(row.original.end_date),
      },
      {
        id: "days_requested",
        accessorKey: "days_requested",
        header: "Days",
        size: 85,
        meta: { priority: 1, flex: true },
        cell: ({ row }) => leaveDaysLabel(row.original),
      },
      {
        id: "user_leave_balance",
        accessorKey: "user_leave_balance",
        header: "Balance Left",
        size: 115,
        meta: { priority: 2, flex: true },
        cell: ({ row }) => <LeaveBalanceBadge balance={row.original.user_leave_balance} />,
      },
      {
        id: "request_type",
        accessorKey: "request_type",
        header: "Type",
        size: 104,
        meta: { priority: 2, flex: true },
        cell: ({ row }) => (
          <Badge variant={row.original.request_type === "vacation" ? "default" : "secondary"}>
            {row.original.request_type === "vacation" ? "Vacation" : "Sick Leave"}
          </Badge>
        ),
      },
      {
        id: "status",
        accessorKey: "status",
        header: "Status",
        size: 100,
        meta: { priority: 1, flex: true },
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
        meta: { actionsDisplay: "column", priority: 1 },
      },
    ],
    [onView, onReject, leaveApprove, leaveReject]
  );

  return { getOvertimeColumns, getStandbyColumns, getLeaveColumns };
};
