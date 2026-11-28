import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, type StatusVariant } from "@/components/ui/StatusBadge";
import { DescriptionColumn } from "@/components/admin/DescriptionColumn";
import { UserCell } from "@/components/admin/UserCell";
import { TicketIdBadges } from "@/components/ui/TicketIdBadges";
import { createCrudActionsColumn } from "@/components/ui/tableColumnHelpers";
import { formatDateDDMMYYYY, isPastMonth } from "@/lib/date-format-utils";
import { OvertimeHoursBadge } from "@/pages/overtime/components/OvertimeHoursBadge";
import type { OvertimeLog } from "@/types";
import type { AppColumnDef } from "@/components/ui/tableTypes";

export const useOvertimeColumns = (
  canViewTeamData: boolean,
  canApprove: boolean,
  onApprove: (id: number) => void,
  onReject: (id: number) => void,
  onEdit: (log: OvertimeLog) => void,
  onDelete: (id: number) => void,
  isAdmin = false,
  isSuperuser = false
): AppColumnDef<OvertimeLog>[] =>
  useMemo(
    () => [
      {
        id: "date",
        accessorKey: "date",
        meta: { priority: 1 },
        header: "Date",
        size: 110,
        cell: ({ row }) => formatDateDDMMYYYY(row.original.date),
      },
      ...(canViewTeamData
        ? [
            {
              id: "user_full_name",
              accessorKey: "user_full_name",
              meta: { priority: 1 },
              header: "Employee",
              size: 160,
              cell: ({ row }) => (
                <UserCell name={row.original.user_full_name || row.original.user_name} />
              ),
            } satisfies AppColumnDef<OvertimeLog>,
          ]
        : []),
      {
        id: "client_name",
        accessorKey: "client_name",
        header: "Client",
        size: 115,
        meta: { priority: 2 },
      },
      {
        id: "ticket_references",
        meta: { priority: 3 },
        header: "Ticket ID",
        size: 125,
        accessorFn: (row) => row.ticket_references?.join(", ") ?? "",
        cell: ({ row }) => <TicketIdBadges references={row.original.ticket_references} />,
      },
      {
        id: "hours",
        accessorKey: "hours",
        meta: { priority: 1 },
        header: "Hours",
        size: 145,
        cell: ({ row }) => <OvertimeHoursBadge log={row.original} />,
      },
      {
        id: "payroll_period",
        meta: { priority: 3 },
        header: "Payroll",
        size: 105,
        cell: ({ row }) =>
          row.original.is_carried_over ? (
            <Badge
              variant="outline"
              className="whitespace-nowrap"
              title={`Carried to ${row.original.requested_period_label ?? "next period"}`}
            >
              Next month
            </Badge>
          ) : (
            <span className="text-muted-foreground whitespace-nowrap">Same month</span>
          ),
      },
      {
        id: "description",
        meta: { priority: 3, truncate: true },
        accessorKey: "description",
        header: "Description",
        size: 160,
        cell: ({ row }) => <DescriptionColumn value={row.original.description} />,
      },
      {
        id: "status",
        accessorKey: "status",
        meta: { priority: 1 },
        header: "Status",
        size: 105,
        cell: ({ row }) => <StatusBadge variant={row.original.status as StatusVariant} />,
      },
      {
        ...createCrudActionsColumn<OvertimeLog>({
          canApprove,
          onApprove,
          onReject,
          onEdit,
          onDelete,
          canEdit: (row) => isAdmin || !isPastMonth(row.date),
          canDelete: (row) => isSuperuser || row.status === "pending" || !isPastMonth(row.date),
        }),
        size: 108,
        meta: { actionsDisplay: "column", priority: 1 },
      },
    ],
    [canViewTeamData, canApprove, onApprove, onReject, onEdit, onDelete, isAdmin, isSuperuser]
  );
