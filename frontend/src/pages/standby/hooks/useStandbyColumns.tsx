import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, type StatusVariant } from "@/components/ui/StatusBadge";
import { createCrudActionsColumn } from "@/components/ui/tableColumnHelpers";
import { formatDateDDMMYYYY, isPastMonth } from "@/lib/date-format-utils";
import type { StandbyLog } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";

export const useStandbyColumns = (
  canViewTeamData: boolean,
  canApprove: boolean,
  onApprove: (id: number) => void,
  onReject: (id: number) => void,
  onEdit: (log: StandbyLog) => void,
  onDelete: (id: number) => void,
  isAdmin = false,
  isSuperuser = false
): ColumnDef<StandbyLog>[] =>
  useMemo(
    () => [
      {
        accessorKey: "date",
        header: "Date",
        cell: ({ row }) => formatDateDDMMYYYY(row.original.date),
      },
      ...(canViewTeamData
        ? [{ accessorKey: "user_full_name", header: "Employee" } satisfies ColumnDef<StandbyLog>]
        : []),
      { accessorKey: "hours", header: "Hours" },
      {
        id: "payroll_period",
        header: "Payroll",
        cell: ({ row }) =>
          row.original.is_carried_over ? (
            <Badge
              variant="outline"
              title={`Submitted period: ${row.original.requested_period_label ?? "next period"}`}
            >
              Carried to {row.original.requested_period_label ?? "next"}
            </Badge>
          ) : (
            <span className="text-muted-foreground">Same month</span>
          ),
      },
      { accessorKey: "description", header: "Description" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge variant={row.original.status as StatusVariant} />,
      },
      createCrudActionsColumn<StandbyLog>({
        canApprove,
        onApprove,
        onReject,
        onEdit,
        onDelete,
        canEdit: (row) => isAdmin || !isPastMonth(row.date),
        canDelete: (row) => isSuperuser || row.status === "pending" || !isPastMonth(row.date),
      }),
    ],
    [canViewTeamData, canApprove, onApprove, onReject, onEdit, onDelete, isAdmin, isSuperuser]
  );
