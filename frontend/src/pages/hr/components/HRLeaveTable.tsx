import React, { useMemo } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/DataTable";
import type { DataTableCardSpec } from "@/components/ui/DataTableCards";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { AppColumnDef } from "@/components/ui/tableTypes";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";

/** Phone card: who and status up top, then type, period and days. */
const LEAVE_CARD: DataTableCardSpec = {
  title: "employee",
  status: "status",
  meta: ["type", "period", "days"],
};

interface LeaveItem {
  id: number;
  user_full_name?: string;
  user_name?: string;
  request_type_display?: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  status_display?: string;
}

interface HRLeaveTableProps {
  leaves: LeaveItem[];
}

export const HRLeaveTable: React.FC<HRLeaveTableProps> = ({ leaves }) => {
  const columns = useMemo<AppColumnDef<LeaveItem>[]>(
    () => [
      {
        id: "employee",
        header: "Employee",
        accessorFn: (v) => v.user_full_name || v.user_name || "Unknown",
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.user_full_name || row.original.user_name || "Unknown"}
          </span>
        ),
      },
      {
        id: "type",
        header: "Type",
        accessorFn: (v) => v.request_type_display || "Vacation",
      },
      {
        id: "period",
        header: "Period",
        // ISO dates sort chronologically as strings.
        accessorFn: (v) => v.start_date,
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {formatDateDDMMYYYY(row.original.start_date)} -{" "}
            {formatDateDDMMYYYY(row.original.end_date)}
          </span>
        ),
      },
      {
        id: "days",
        header: "Days",
        accessorFn: (v) => v.days_requested,
        cell: ({ row }) => (
          <span className="font-mono whitespace-nowrap tabular-nums">
            {row.original.days_requested}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (v) => v.status,
        cell: ({ row }) => (
          <StatusBadge
            variant={row.original.status}
            label={row.original.status_display || row.original.status}
          />
        ),
      },
    ],
    []
  );

  return (
    <GlassCard className="space-y-4 p-5">
      <CardHeader className="p-0">
        <CardTitle className="text-sm font-semibold">Leave Requests</CardTitle>
      </CardHeader>
      <DataTable
        columns={columns}
        data={leaves}
        getRowId={(v) => String(v.id)}
        emptyMessage="No leave requests found."
        mobileCard={LEAVE_CARD}
      />
    </GlassCard>
  );
};
