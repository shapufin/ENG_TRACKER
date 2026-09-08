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
 * Each helper returns a single ColumnDef<T> — the caller spreads it into
 * their column array. The row type T must extend { id: number } (and
 * { status: string } for helpers that check pending status).
 */
import React from "react";
import { Button } from "@/components/ui/button";
import { Check, X, Pencil, Trash2, Eye, CheckCircle, XCircle } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import type { ColumnDef } from "@tanstack/react-table";

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
): ColumnDef<T> => ({
  id: "actions",
  header: "Actions",
  cell: ({ row }) => (
    <div className="flex gap-1">
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
});

/**
 * Actions column with approve/reject (conditional on pending + canApprove)
 * + edit + delete buttons.
 * Used by useOvertimeColumns and useStandbyColumns.
 *
 * `canEdit`/`canDelete` are optional per-row predicates. When they return
 * false, the button is rendered disabled with a "Locked: past month" tooltip
 * (used by the monthly edit/delete lock on overtime/standby records).
 */
export const createCrudActionsColumn = <T extends WithIdAndStatus>(config: {
  canApprove: boolean;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onEdit: (row: T) => void;
  onDelete: (id: number) => void;
  canEdit?: (row: T) => boolean;
  canDelete?: (row: T) => boolean;
}): ColumnDef<T> => ({
  id: "actions",
  header: "Actions",
  cell: ({ row }) => {
    const editAllowed = config.canEdit ? config.canEdit(row.original) : true;
    const deleteAllowed = config.canDelete ? config.canDelete(row.original) : true;
    return (
      <TooltipProvider delayDuration={200}>
        <div className="flex items-center gap-1">
          {row.original.status === "pending" && config.canApprove && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-11 w-11 p-0 text-success"
                aria-label={`Approve ${row.original.id}`}
                onClick={() => config.onApprove(row.original.id)}
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-11 w-11 p-0 text-destructive"
                aria-label={`Reject ${row.original.id}`}
                onClick={() => config.onReject(row.original.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
          {editAllowed ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-11 w-11 p-0"
              aria-label={`Edit ${row.original.id}`}
              onClick={() => config.onEdit(row.original)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-11 w-11 p-0"
                    aria-label={`Edit ${row.original.id}`}
                    disabled
                  >
                    <Pencil className="h-4 w-4 opacity-40" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Locked — ask a superuser to delete records from past months.
              </TooltipContent>
            </Tooltip>
          )}
          {deleteAllowed ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-11 w-11 p-0 text-destructive"
              aria-label={`Delete ${row.original.id}`}
              onClick={() => config.onDelete(row.original.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-11 w-11 p-0 text-destructive"
                    aria-label={`Delete ${row.original.id}`}
                    disabled
                  >
                    <Trash2 className="h-4 w-4 opacity-40" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Locked — ask a superuser to delete records from past months.
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </TooltipProvider>
    );
  },
});

/**
 * Actions column with view + approve/reject buttons.
 * Approve/reject are conditional on pending status, have stopPropagation,
 * and respect disabled state from pending mutations.
 * Used by useTeamColumns (overtime, standby, leave variations).
 */
export const createViewApproveRejectActionsColumn = <T extends WithIdAndStatus>(config: {
  onView: (row: T) => void;
  approveMutate: (id: number) => void;
  approvePending: boolean;
  onReject: (id: number) => void;
  rejectPending: boolean;
}): ColumnDef<T> => ({
  id: "actions",
  header: "Actions",
  cell: ({ row }) => (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant="ghost"
        className="h-11 w-11 p-0"
        aria-label={`View ${row.original.id}`}
        onClick={() => config.onView(row.original)}
      >
        <Eye className="h-4 w-4" />
      </Button>
      {row.original.status === "pending" && (
        <>
          <Button
            size="sm"
            variant="ghost"
            className="h-11 w-11 p-0 text-success"
            aria-label={`Approve ${row.original.id}`}
            onClick={(e) => {
              e.stopPropagation();
              config.approveMutate(row.original.id);
            }}
            disabled={config.approvePending}
          >
            <CheckCircle className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-11 w-11 p-0 text-destructive"
            aria-label={`Reject ${row.original.id}`}
            onClick={(e) => {
              e.stopPropagation();
              config.onReject(row.original.id);
            }}
            disabled={config.rejectPending}
          >
            <XCircle className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  ),
});
