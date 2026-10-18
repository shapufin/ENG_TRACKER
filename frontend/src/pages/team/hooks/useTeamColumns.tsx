import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { LeaveBalanceBadge } from "@/components/ui/LeaveBalanceBadge";
import { StatusBadge, type StatusVariant } from "@/components/ui/StatusBadge";
import { UserCell } from "@/components/admin/UserCell";
import { createViewApproveRejectActionsColumn } from "@/components/ui/tableColumnHelpers";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
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
        size: 140,
        cell: ({ row }) => (
          <UserCell name={row.original.user_full_name || row.original.user_name} />
        ),
      },
      {
        accessorKey: "date",
        header: "Date",
        size: 80,
        cell: ({ row }) => formatDateDDMMYYYY(row.original.date),
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
        accessorKey: "client_name",
        header: "Client",
        size: 110,
        cell: ({ row }) => row.original.client_name || "-",
      },
      {
        accessorKey: "description",
        header: "Description",
        size: 110,
        cell: ({ row }) => row.original.description || "-",
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 90,
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
        size: 140,
        cell: ({ row }) => (
          <UserCell name={row.original.user_full_name || row.original.user_name} />
        ),
      },
      {
        accessorKey: "date",
        header: "Date",
        size: 80,
        cell: ({ row }) => formatDateDDMMYYYY(row.original.date),
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
        accessorKey: "description",
        header: "Description",
        size: 110,
        cell: ({ row }) => row.original.description || "-",
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 90,
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
        size: 140,
        cell: ({ row }) => (
          <UserCell name={row.original.user_full_name || row.original.user_name} />
        ),
      },
      {
        accessorKey: "start_date",
        header: "Start Date",
        size: 112,
        cell: ({ row }) => formatDateDDMMYYYY(row.original.start_date),
      },
      {
        accessorKey: "end_date",
        header: "End Date",
        size: 112,
        cell: ({ row }) => formatDateDDMMYYYY(row.original.end_date),
      },
      {
        accessorKey: "days_requested",
        header: "Days",
        size: 84,
        cell: ({ row }) => row.original.days_requested,
      },
      {
        accessorKey: "user_leave_balance",
        header: "Balance Left",
        size: 128,
        cell: ({ row }) => <LeaveBalanceBadge balance={row.original.user_leave_balance} />,
      },
      {
        accessorKey: "request_type",
        header: "Type",
        size: 104,
        cell: ({ row }) => (
          <Badge variant={row.original.request_type === "vacation" ? "default" : "secondary"}>
            {row.original.request_type === "vacation" ? "Vacation" : "Sick Leave"}
          </Badge>
        ),
      },
      {
        accessorKey: "reason",
        header: "Reason",
        size: 110,
        cell: ({ row }) => row.original.reason || "-",
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 127,
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
