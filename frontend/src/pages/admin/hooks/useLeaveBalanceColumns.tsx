import { useMemo } from "react";
import { createEditDeleteActionsColumn } from "@/components/ui/tableColumnHelpers";
import type { LeaveBalance } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";

export const useLeaveBalanceColumns = (
  onEdit: (b: LeaveBalance) => void,
  onDelete: (b: LeaveBalance) => void
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
      createEditDeleteActionsColumn<LeaveBalance>(onEdit, onDelete),
    ],
    [onEdit, onDelete]
  );
