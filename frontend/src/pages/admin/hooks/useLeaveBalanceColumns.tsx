import { useMemo } from "react";
import { RowActions } from "@/components/ui/RowActions";
import { Eye, Pencil, Trash2 } from "lucide-react";
import type { LeaveBalance } from "@/types";
import type { AppColumnDef } from "@/components/ui/tableTypes";
import { UserCell } from "@/components/admin/UserCell";
import { cn } from "@/lib/utils";
import { isExpiringSoon } from "./leaveBalanceFilters";

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const num = (n: number | undefined | null) =>
  typeof n === "number" ? numberFormat.format(n) : "—";
const NUM_CELL = "block text-right tabular-nums";

const utilizationBar = (used: number, total: number) => {
  if (!(total > 0)) return <span className="text-muted-foreground">{"—"}</span>;
  const pct = Math.round((used / total) * 100);
  return (
    <div
      role="img"
      aria-label={`${pct}% used`}
      className="bg-tone-neutral-surface h-2 w-24 overflow-hidden rounded-full"
    >
      <div
        className={cn("h-full rounded-full", pct >= 100 ? "bg-tone-warning-text" : "bg-primary")}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
};

const numCol = (
  id: "total_days" | "used_days" | "pending_days" | "available_days" | "effective_available_days",
  header: string,
  bold = false
): AppColumnDef<LeaveBalance> => ({
  id,
  accessorKey: id,
  header,
  cell: ({ row }) => (
    <span className={cn(NUM_CELL, bold && "font-semibold")}>{num(row.original[id])}</span>
  ),
});

export const useLeaveBalanceColumns = (
  onEdit: (b: LeaveBalance) => void,
  onDelete: (b: LeaveBalance) => void,
  onView?: (b: LeaveBalance) => void
): AppColumnDef<LeaveBalance>[] =>
  useMemo(
    () => [
      {
        id: "user_name",
        accessorKey: "user_name",
        header: "Employee",
        cell: ({ row }) => <UserCell name={row.original.user_name} />,
      },
      {
        id: "leave_type",
        accessorKey: "leave_type",
        header: "Type",
        cell: ({ row }) => <span className="capitalize">{row.original.leave_type}</span>,
      },
      { id: "year", accessorKey: "year", header: "Year" },
      numCol("total_days", "Total"),
      numCol("used_days", "Used"),
      {
        id: "utilization",
        header: "Utilization",
        enableSorting: false,
        cell: ({ row }) => utilizationBar(row.original.used_days, row.original.total_days),
      },
      numCol("pending_days", "Pending"),
      numCol("available_days", "Available", true),
      numCol("effective_available_days", "Effective"),
      {
        id: "is_carry_over",
        accessorKey: "is_carry_over",
        header: "Carry-over",
        cell: ({ row }) => (row.original.is_carry_over ? "Yes" : "No"),
      },
      {
        id: "expires_at",
        accessorKey: "expires_at",
        header: "Expires",
        cell: ({ row }) => (
          <span
            className={cn(
              "tabular-nums",
              isExpiringSoon(row.original, new Date()) && "text-tone-warning-text font-medium"
            )}
          >
            {row.original.expires_at ?? "—"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <RowActions
            actions={[
              ...(onView
                ? [
                    {
                      label: `View ${row.original.id}`,
                      icon: Eye,
                      onClick: () => onView(row.original),
                    },
                  ]
                : []),
              {
                label: `Edit ${row.original.id}`,
                icon: Pencil,
                onClick: () => onEdit(row.original),
              },
              {
                label: `Delete ${row.original.id}`,
                icon: Trash2,
                tone: "danger" as const,
                onClick: () => onDelete(row.original),
              },
            ]}
          />
        ),
      },
    ],
    [onEdit, onDelete, onView]
  );
