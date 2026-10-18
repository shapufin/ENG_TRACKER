import { Plane } from "lucide-react";
import { StatusBadge, type StatusVariant } from "@/components/ui/StatusBadge";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import type { LeaveRequest } from "@/types";
import type { AppColumnDef } from "@/components/ui/tableTypes";

/**
 * Explicit column widths. `DataTable` falls back to TanStack's 150px default for
 * an unsized column, which is wider than these fields need and pushed the table
 * past its 1076px viewport at 1440px (horizontal scroll). Each value is the
 * measured header/content width plus slack; the free-text `reason` column is the
 * one flexible column and truncates.
 */
export const leaveRequestBaseColumns = <T extends LeaveRequest>(
  includePlaneIcon = false
): AppColumnDef<T>[] => [
  { accessorKey: "user_name", header: "User", size: 140 },
  includePlaneIcon
    ? {
        accessorKey: "request_type",
        header: "Type",
        size: 100,
        cell: (info) => (
          <span className="inline-flex items-center gap-1 text-xs font-medium capitalize">
            <Plane className="text-icon-vacation h-3 w-3" />
            {info.getValue() as string}
          </span>
        ),
      }
    : { accessorKey: "request_type", header: "Type", size: 100 },
  {
    accessorKey: "start_date",
    header: "Start",
    size: 112,
    cell: (info) => formatDateDDMMYYYY(info.getValue() as string),
  },
  {
    accessorKey: "end_date",
    header: "End",
    size: 112,
    cell: (info) => formatDateDDMMYYYY(info.getValue() as string),
  },
  { accessorKey: "days_requested", header: "Days", size: 84 },
  {
    accessorKey: "status",
    header: "Status",
    size: 127,
    cell: (info) => <StatusBadge variant={info.getValue() as StatusVariant} />,
  },
];
