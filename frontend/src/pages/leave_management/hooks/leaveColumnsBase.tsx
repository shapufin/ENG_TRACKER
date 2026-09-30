import { Plane } from "lucide-react";
import { StatusBadge, type StatusVariant } from "@/components/ui/StatusBadge";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import type { LeaveRequest } from "@/types";
import type { AppColumnDef } from "@/components/ui/tableTypes";

export const leaveRequestBaseColumns = <T extends LeaveRequest>(
  includePlaneIcon = false
): AppColumnDef<T>[] => [
  { accessorKey: "user_name", header: "User" },
  includePlaneIcon
    ? {
        accessorKey: "request_type",
        header: "Type",
        cell: (info) => (
          <span className="inline-flex items-center gap-1 text-xs font-medium capitalize">
            <Plane className="h-3 w-3 text-icon-vacation" />
            {info.getValue() as string}
          </span>
        ),
      }
    : { accessorKey: "request_type", header: "Type" },
  {
    accessorKey: "start_date",
    header: "Start",
    cell: (info) => formatDateDDMMYYYY(info.getValue() as string),
  },
  {
    accessorKey: "end_date",
    header: "End",
    cell: (info) => formatDateDDMMYYYY(info.getValue() as string),
  },
  { accessorKey: "days_requested", header: "Days" },
  {
    accessorKey: "status",
    header: "Status",
    cell: (info) => (
      <StatusBadge variant={info.getValue() as StatusVariant} />
    ),
  },
];
