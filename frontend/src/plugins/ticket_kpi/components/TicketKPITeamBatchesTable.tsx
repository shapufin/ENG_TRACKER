import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/DataTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Eye, Trash2 } from "lucide-react";
import { formatMonthLabel } from "@/lib/monthOptions";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import type { ColumnDef } from "@tanstack/react-table";
import type { BatchRow } from "../pages/hooks/useTicketKPITeamManagement";

interface TicketKPITeamBatchesTableProps {
  rows: BatchRow[];
  isLoading: boolean;
  onDelete: (batch: BatchRow) => void;
}

export const TicketKPITeamBatchesTable: React.FC<TicketKPITeamBatchesTableProps> = ({
  rows,
  isLoading,
  onDelete,
}) => {
  const navigate = useNavigate();

  const columns = useMemo<ColumnDef<BatchRow>[]>(
    () => [
      {
        accessorKey: "user_name",
        header: "User",
        cell: ({ row }) => <div className="font-medium">{row.original.user_name}</div>,
      },
      {
        accessorKey: "month",
        header: "Month",
        cell: ({ row }) => formatMonthLabel(row.original.month),
      },
      {
        accessorKey: "profile_name",
        header: "Profile",
        cell: ({ row }) => row.original.profile_name || `Profile ${row.original.profile}`,
      },
      {
        accessorKey: "record_count",
        header: "Records",
      },
      {
        accessorKey: "created_at",
        header: "Uploaded",
        cell: ({ row }) =>
          row.original.created_at
            ? formatDateDDMMYYYY(row.original.created_at.slice(0, 10))
            : "N/A",
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <TooltipProvider>
            <div className="flex items-center justify-end gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label="View member dashboard"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(
                        `/ticket-kpi/dashboard?user_id=${row.original.user}&month=${row.original.month}`
                      );
                    }}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    aria-label="Delete upload"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(row.original);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        ),
      },
    ],
    [navigate, onDelete]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Uploads</CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={rows}
          searchColumn="user_name"
          searchPlaceholder="Search team member..."
          pageSize={10}
          emptyMessage={isLoading ? "Loading..." : "No team uploads found."}
        />
      </CardContent>
    </Card>
  );
};
