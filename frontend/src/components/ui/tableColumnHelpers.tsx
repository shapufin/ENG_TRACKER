/**
 * Shared column helpers for @tanstack/react-table action columns.
 *
 * Extracted to eliminate duplication flagged by fallow dupes analysis:
 * - createEditDeleteActionsColumn: edit + delete buttons (ClientDataTable,
 *   useLeaveBalanceColumns)
 * - createCrudActionsColumn: approve/reject (conditional) + edit + delete
 *   (useOvertimeColumns, useStandbyColumns)
 * - createViewApproveRejectActionsColumn: view + approve/reject with
 *   stopPropagation + disabled state (useTeamColumns x3)
 *
 * Each helper returns a single AppColumnDef<T> — the caller spreads it into
 * their column array. The row type T must extend { id: number } (and
 * { status: string } for helpers that check pending status).
 */
import React from "react";
import { Check, X, Pencil, Trash2, Eye, CheckCircle, XCircle } from "lucide-react";
import { RowActions, type RowAction } from "@/components/ui/RowActions";
import type { AppColumnDef } from "@/components/ui/tableTypes";

interface WithId {
  id: number;
}
interface WithIdAndStatus extends WithId {
  status: string;
}

/**
 * Actions column with edit + delete buttons only.
 * Used by ClientDataTable and useLeaveBalanceColumns.
 */
export const createEditDeleteActionsColumn = <T extends WithId>(
  onEdit: (row: T) => void,
  onDelete: (row: T) => void
): AppColumnDef<T> => ({
  id: "actions",
  header: "Actions",
  cell: ({ row }) => (
    <RowActions
      actions={[
        { label: `Edit ${row.original.id}`, icon: Pencil, onClick: () => onEdit(row.original) },
        {
          label: `Delete ${row.original.id}`,
          icon: Trash2,
          tone: "danger",
          onClick: () => onDelete(row.original),
        },
      ]}
    />
  ),
});

/**
 * Actions column with approve/reject (conditional on pending + canApprove)
 * + edit + delete buttons.
 * Used by useOvertimeColumns and useStandbyColumns.
 *
 * `canEdit`/`canDelete` are optional per-row predicates. When they return
 * false, the button is rendered disabled (used by the monthly edit/delete
 * lock on overtime/standby records).
 */
export const createCrudActionsColumn = <T extends WithIdAndStatus>(config: {
  canApprove: boolean;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onEdit: (row: T) => void;
  onDelete: (id: number) => void;
  canEdit?: (row: T) => boolean;
  canDelete?: (row: T) => boolean;
}): AppColumnDef<T> => ({
  id: "actions",
  header: "Actions",
  cell: ({ row }) => {
    const { id, status } = row.original;
    const actions: RowAction[] = [];
    if (status === "pending" && config.canApprove) {
      actions.push(
        {
          label: `Approve ${id}`,
          icon: Check,
          tone: "success",
          onClick: () => config.onApprove(id),
        },
        { label: `Reject ${id}`, icon: X, tone: "danger", onClick: () => config.onReject(id) }
      );
    }
    actions.push(
      {
        label: `Edit ${id}`,
        icon: Pencil,
        disabled: config.canEdit ? !config.canEdit(row.original) : false,
        onClick: () => config.onEdit(row.original),
      },
      {
        label: `Delete ${id}`,
        icon: Trash2,
        tone: "danger",
        disabled: config.canDelete ? !config.canDelete(row.original) : false,
        onClick: () => config.onDelete(id),
      }
    );
    return <RowActions actions={actions} />;
  },
});

/**
 * Actions column with view + approve/reject buttons.
 * Approve/reject are conditional on pending status and respect disabled
 * state from pending mutations (RowActions stops click propagation).
 * Used by useTeamColumns (overtime, standby, leave variations).
 */
export const createViewApproveRejectActionsColumn = <T extends WithIdAndStatus>(config: {
  onView: (row: T) => void;
  approveMutate: (id: number) => void;
  approvePending: boolean;
  onReject: (id: number) => void;
  rejectPending: boolean;
}): AppColumnDef<T> => ({
  id: "actions",
  header: "Actions",
  cell: ({ row }) => {
    const { id, status } = row.original;
    const actions: RowAction[] = [
      { label: `View ${id}`, icon: Eye, onClick: () => config.onView(row.original) },
    ];
    if (status === "pending") {
      actions.push(
        {
          label: `Approve ${id}`,
          icon: CheckCircle,
          tone: "success",
          disabled: config.approvePending,
          onClick: () => config.approveMutate(id),
        },
        {
          label: `Reject ${id}`,
          icon: XCircle,
          tone: "danger",
          disabled: config.rejectPending,
          onClick: () => config.onReject(id),
        }
      );
    }
    return <RowActions actions={actions} />;
  },
});
