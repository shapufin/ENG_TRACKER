import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, type StatusVariant } from "@/components/ui/StatusBadge";
import { UserCell } from "@/components/admin/UserCell";
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
        accessorKey: "date",
        header: "Date",
        size: 80,
        cell: ({ row }) => formatDateDDMMYYYY(row.original.date),
      },
      ...(canViewTeamData
        ? [
            {
              accessorKey: "user_full_name",
              header: "Employee",
              size: 120,
              cell: ({ row }) => (
                <UserCell name={row.original.user_full_name || row.original.user_name} />
              ),
            } satisfies AppColumnDef<OvertimeLog>,
          ]
        : []),
      { accessorKey: "client_name", header: "Client", size: 110 },
      {
        id: "ticket_references",
        header: "Ticket ID",
        size: 110,
        accessorFn: (row) => row.ticket_references?.join(", ") ?? "",
        cell: ({ row }) => {
          const refs = row.original.ticket_references;
          if (!refs || refs.length === 0) {
            return <span className="text-muted-foreground">-</span>;
          }
          return (
            <span
              className="truncate font-mono text-xs max-md:break-words max-md:whitespace-normal"
              title={refs.join(", ")}
            >
              {refs.join(", ")}
            </span>
          );
        },
      },
      {
        accessorKey: "hours",
        header: "Hours",
        size: 87,
        cell: ({ row }) => <OvertimeHoursBadge log={row.original} />,
      },
      {
        id: "payroll_period",
        header: "Payroll",
        size: 120,
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
      { accessorKey: "description", header: "Description", size: 110 },
      {
        accessorKey: "status",
        header: "Status",
        size: 90,
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
        // Widest row: approve + reject + edit + delete icons.
        size: 150,
      },
    ],
    [canViewTeamData, canApprove, onApprove, onReject, onEdit, onDelete, isAdmin, isSuperuser]
  );
