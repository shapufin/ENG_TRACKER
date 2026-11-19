import React, { useMemo } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { DataTable } from "@/components/ui/DataTable";
import { UserCell } from "@/components/admin/UserCell";
import { LeaveBalanceBadge } from "@/components/ui/LeaveBalanceBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock } from "lucide-react";
import type { AppColumnDef } from "@/components/ui/tableTypes";
import type { DataTableServerMode } from "@/components/ui/DataTable";
import type { DataTableCardSpec } from "@/components/ui/DataTableCards";
import type { LeaveRequest } from "@/types";
import type { SelectedUserTarget } from "./UserLeaveRequestsModal";

export interface UserLeaveSummary extends SelectedUserTarget {
  totalRequests: number;
  totalDays: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  vacationCount: number;
  sickCount: number;
  requests: LeaveRequest[];
  latestRequest?: LeaveRequest;
}

const USER_LEAVE_SUMMARY_CARD: DataTableCardSpec = {
  title: "userFullName",
  hero: "totalDays",
  status: "pendingCount",
  meta: ["totalRequests", "userLeaveBalance"],
  actions: "actions",
};

interface LeaveUserGroupedTableProps {
  requests: LeaveRequest[];
  onSelectUser: (user: SelectedUserTarget) => void;
  header?: React.ReactNode;
  toolbar?: React.ReactNode;
  server: DataTableServerMode;
}

/**
 * Clean user-grouped view for HR Leave Requests.
 * Displays one consolidated row per employee to prevent table bloating,
 * with quick metrics and a one-click launcher for the user vacation modal.
 */
export const LeaveUserGroupedTable: React.FC<LeaveUserGroupedTableProps> = ({
  requests,
  onSelectUser,
  header,
  toolbar,
  server,
}) => {
  const userSummaries = useMemo<UserLeaveSummary[]>(() => {
    const map = new Map<number, UserLeaveSummary>();
    for (const r of requests) {
      const uId = r.user;
      let entry = map.get(uId);
      if (!entry) {
        entry = {
          userId: uId,
          userName: r.user_name || "",
          userFullName: r.user_full_name || r.user_name || `User #${uId}`,
          userCode: r.user_code,
          teamName: r.team_name,
          userLeaveBalance: r.user_leave_balance,
          totalRequests: 0,
          totalDays: 0,
          pendingCount: 0,
          approvedCount: 0,
          rejectedCount: 0,
          vacationCount: 0,
          sickCount: 0,
          requests: [],
          latestRequest: r,
        };
        map.set(uId, entry);
      }
      entry.totalRequests += 1;
      entry.totalDays += Number(r.days_requested) || 0;
      if (r.status === "pending") entry.pendingCount += 1;
      else if (r.status === "approved") entry.approvedCount += 1;
      else if (r.status === "rejected") entry.rejectedCount += 1;

      if (r.request_type === "vacation") entry.vacationCount += 1;
      else entry.sickCount += 1;

      entry.requests.push(r);
    }
    return Array.from(map.values());
  }, [requests]);

  const columns = useMemo<AppColumnDef<UserLeaveSummary>[]>(
    () => [
      {
        id: "userFullName",
        accessorKey: "userFullName",
        header: "Employee",
        size: 180,
        cell: ({ row }) => (
          <UserCell
            name={row.original.userFullName}
            subtitle={row.original.userName ? `@${row.original.userName}` : null}
          />
        ),
      },
      {
        id: "teamName",
        accessorKey: "teamName",
        header: "Team",
        size: 130,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm font-medium">
            {row.original.teamName || "—"}
          </span>
        ),
      },
      {
        id: "totalRequests",
        accessorKey: "totalRequests",
        header: "Requests",
        size: 140,
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <span className="text-foreground font-mono text-sm font-medium tabular-nums">
              {row.original.totalRequests}{" "}
              {row.original.totalRequests === 1 ? "request" : "requests"}
            </span>
            <span className="text-muted-foreground font-mono text-xs">
              {row.original.vacationCount} vac
              {row.original.sickCount > 0 ? ` · ${row.original.sickCount} sick` : ""}
            </span>
          </div>
        ),
      },
      {
        id: "totalDays",
        accessorKey: "totalDays",
        header: "Days Taken",
        size: 110,
        cell: ({ row }) => (
          <span className="text-foreground font-mono text-sm font-semibold tabular-nums">
            {row.original.totalDays} {row.original.totalDays === 1 ? "day" : "days"}
          </span>
        ),
      },
      {
        id: "pendingCount",
        accessorKey: "pendingCount",
        header: "Pending",
        size: 110,
        cell: ({ row }) =>
          row.original.pendingCount > 0 ? (
            <Badge
              variant="outline"
              className="border-tone-warning-border bg-tone-warning-surface text-tone-warning-text text-xs font-medium"
            >
              <Clock className="mr-1 h-3 w-3" aria-hidden="true" />
              {row.original.pendingCount} pending
            </Badge>
          ) : (
            <span className="text-muted-foreground font-mono text-xs">—</span>
          ),
      },
      {
        id: "userLeaveBalance",
        accessorKey: "userLeaveBalance",
        header: "Balance Left",
        size: 120,
        cell: ({ row }) => <LeaveBalanceBadge balance={row.original.userLeaveBalance} />,
      },
      {
        id: "actions",
        meta: { actionsDisplay: "column" },
        header: "Actions",
        size: 160,
        cell: ({ row }) => (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onSelectUser(row.original)}
            className="gap-1.5"
            aria-label={`View vacations for ${row.original.userFullName}`}
          >
            <Calendar className="text-muted-foreground h-3.5 w-3.5" aria-hidden="true" />
            View Vacations
            {row.original.pendingCount > 0 && (
              <span
                className="bg-tone-warning-text ml-0.5 inline-flex h-2 w-2 rounded-full"
                aria-hidden="true"
              />
            )}
          </Button>
        ),
      },
    ],
    [onSelectUser]
  );

  return (
    <GlassCard className="p-4">
      {header && <div className="border-line-subtle mb-4 border-b pb-4">{header}</div>}
      <DataTable
        data={userSummaries}
        server={server}
        pageSize={userSummaries.length || 10}
        columns={columns}
        toolbarActions={toolbar}
        storageKey="table-visibility-leave-users"
        getRowId={(row) => row.userId.toString()}
        mobileCard={USER_LEAVE_SUMMARY_CARD}
        onRowClick={(row) => onSelectUser(row)}
      />
    </GlassCard>
  );
};
