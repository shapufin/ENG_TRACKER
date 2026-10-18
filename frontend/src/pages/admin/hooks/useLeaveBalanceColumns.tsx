import { useMemo } from "react";
import { RowActions } from "@/components/ui/RowActions";
import { Eye, Pencil, Trash2 } from "lucide-react";
import type { LeaveBalance } from "@/types";
import type { AppColumnDef } from "@/components/ui/tableTypes";
import { UserCell } from "@/components/admin/UserCell";
import { cn } from "@/lib/utils";
import { isExpiringSoon, toDays } from "./leaveBalanceFilters";

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const num = (n: unknown) => {
  const v = toDays(n);
  return v === null ? "—" : numberFormat.format(v);
};
const NUM_CELL = "block text-right tabular-nums";

const utilizationBar = (used: unknown, total: unknown) => {
  const totalDays = toDays(total) ?? 0;
  if (!(totalDays > 0)) return <span className="text-muted-foreground">{"—"}</span>;
  const pct = Math.round(((toDays(used) ?? 0) / totalDays) * 100);
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
  size: number,
  bold = false
): AppColumnDef<LeaveBalance> => ({
  id,
  accessorKey: id,
  header,
  size,
  cell: ({ row }) => (
    <span className={cn(NUM_CELL, bold && "font-semibold")}>{num(row.original[id])}</span>
  ),
});

/**
 * Explicit widths: 11 columns at TanStack's 150px default were ~575px past the
 * 1440px viewport. Values are the measured header/content width plus slack; the
 * `is_carry_over` flag is hidden by default (see LeaveBalancesPage) since the
 * Expires/Effective columns already carry that information.
 */
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
        size: 130,
        cell: ({ row }) => <UserCell name={row.original.user_name} />,
      },
      {
        id: "leave_type",
        accessorKey: "leave_type",
        header: "Type",
        size: 82,
        cell: ({ row }) => <span className="capitalize">{row.original.leave_type}</span>,
      },
      { id: "year", accessorKey: "year", header: "Year", size: 73 },
      numCol("total_days", "Total", 78),
      numCol("used_days", "Used", 82),
      {
        id: "utilization",
        header: "Utilization",
        // Fixed: the bar is `w-24` (96px) plus the cell's px-4 gutter.
        size: 128,
        enableSorting: false,
        cell: ({ row }) => utilizationBar(row.original.used_days, row.original.total_days),
      },
      numCol("pending_days", "Pending", 100),
      numCol("available_days", "Available", 104, true),
      numCol("effective_available_days", "Effective", 105),
      {
        id: "is_carry_over",
        accessorKey: "is_carry_over",
        header: "Carry-over",
        size: 118,
        cell: ({ row }) => (row.original.is_carry_over ? "Yes" : "No"),
      },
      {
        id: "expires_at",
        accessorKey: "expires_at",
        header: "Expires",
        size: 95,
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
        size: 100,
        cell: ({ row }) => (
          <RowActions
            actions={[
              ...(onView
                ? [
                    {
                      label: `View ${row.original.id}`,
                      shortLabel: "View",
                      icon: Eye,
                      onClick: () => onView(row.original),
                    },
                  ]
                : []),
              {
                label: `Edit ${row.original.id}`,
                shortLabel: "Edit",
                icon: Pencil,
                onClick: () => onEdit(row.original),
              },
              {
                label: `Delete ${row.original.id}`,
                shortLabel: "Delete",
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
