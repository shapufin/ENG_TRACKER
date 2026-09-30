import { Moon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { StandbyLog } from "@/types";
import type { AppColumnDef } from "@/components/ui/tableTypes";

export const timeRangeColumn: AppColumnDef<StandbyLog> = {
  id: "time_range",
  accessorKey: "time_range",
  header: "Time",
  cell: ({ row }) => (
    <Badge variant="outline">
      <Moon className="mr-1 h-3 w-3" />
      {row.original.start_time || "-"} - {row.original.end_time || "-"}
    </Badge>
  ),
};
