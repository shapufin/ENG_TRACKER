import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Eye, Pencil, Trash2 } from "lucide-react";
import type { LeaveBalance } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";

export const useLeaveBalanceColumns = (
  onEdit: (b: LeaveBalance) => void,
  onDelete: (b: LeaveBalance) => void,
  onView?: (b: LeaveBalance) => void
): ColumnDef<LeaveBalance>[] =>
  useMemo(
    () => [
      { id: "user_name", accessorKey: "user_name", header: "Employee" },
      {
        id: "leave_type",
        accessorKey: "leave_type",
        header: "Type",
        cell: ({ row }) => <span className="capitalize">{row.original.leave_type}</span>,
      },
      { id: "year", accessorKey: "year", header: "Year" },
      { id: "total_days", accessorKey: "total_days", header: "Total" },
      { id: "used_days", accessorKey: "used_days", header: "Used" },
      { id: "pending_days", accessorKey: "pending_days", header: "Pending" },
      { id: "available_days", accessorKey: "available_days", header: "Available" },
      {
        id: "effective_available_days",
        accessorKey: "effective_available_days",
        header: "Effective",
      },
      {
        id: "is_carry_over",
        accessorKey: "is_carry_over",
        header: "Carry-over",
        cell: ({ row }) => (row.original.is_carry_over ? "Yes" : "No"),
      },
      { id: "expires_at", accessorKey: "expires_at", header: "Expires" },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex gap-1">
            {onView && (
              <Button
                size="sm"
                variant="ghost"
                className="h-11 w-11 p-0"
                aria-label={`View ${row.original.id}`}
                onClick={() => onView(row.original)}
              >
                <Eye className="h-4 w-4" />
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-11 w-11 p-0"
              aria-label={`Edit ${row.original.id}`}
              onClick={() => onEdit(row.original)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-11 w-11 p-0 text-destructive"
              aria-label={`Delete ${row.original.id}`}
              onClick={() => onDelete(row.original)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [onEdit, onDelete, onView]
  );
