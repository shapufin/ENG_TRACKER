import React from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import { HRTableShell } from "./HRTableShell";

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

export const HRLeaveTable: React.FC<HRLeaveTableProps> = ({ leaves }) => (
  <HRTableShell
    title="Leave Requests"
    headers={[
      { label: "Employee" },
      { label: "Type" },
      { label: "Period" },
      { label: "Days", align: "right" },
      { label: "Status", align: "center" },
    ]}
  >
    {leaves.length > 0 ? (
      leaves.map((v) => (
        <tr key={v.id} className="transition-colors hover:bg-primary/[0.02]">
          <td className="px-6 py-4 font-medium">{v.user_full_name || v.user_name || "Unknown"}</td>
          <td className="px-6 py-4">{v.request_type_display || "Vacation"}</td>
          <td className="px-6 py-4">
            {formatDateDDMMYYYY(v.start_date)} - {formatDateDDMMYYYY(v.end_date)}
          </td>
          <td className="px-6 py-4 text-right font-mono">{v.days_requested}</td>
          <td className="px-6 py-4 text-center">
            <StatusBadge variant={v.status} label={v.status_display || v.status} />
          </td>
        </tr>
      ))
    ) : (
      <tr>
        <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
          No leave requests found.
        </td>
      </tr>
    )}
  </HRTableShell>
);
