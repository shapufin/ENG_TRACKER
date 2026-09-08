import { Plane } from "lucide-react";
import { StatusBadge, type StatusVariant } from "@/components/ui/StatusBadge";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import type { LeaveRequest } from "@/types";
import type { ColumnDef, CellContext } from "@tanstack/react-table";

export const leaveRequestBaseColumns = <T extends LeaveRequest>(
  includePlaneIcon = false
): ColumnDef<T>[] => [
  { accessorKey: "user_name", header: "User" },
  includePlaneIcon
    ? {
        accessorKey: "request_type",
        header: "Type",
        cell: (info: CellContext<T, T["request_type"]>) => (
          <span className="inline-flex items-center gap-1 text-xs font-medium capitalize">
            <Plane className="h-3 w-3 text-icon-vacation" />
            {info.getValue()}
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
    cell: (info: CellContext<T, T["status"]>) => (
      <StatusBadge variant={info.getValue() as StatusVariant} />
    ),
  },
];
