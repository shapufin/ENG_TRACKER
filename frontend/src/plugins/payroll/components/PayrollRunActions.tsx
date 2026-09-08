/**
 * PayrollRunActions — action buttons + finalize confirmation dialog.
 */
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { ClosureStatus } from "../types";

interface PayrollRunActionsProps {
  isDraft: boolean;
  lineCount: number;
  canManage: boolean;
  canExport: boolean;
  onGenerate: () => void;
  onFinalize: () => void;
  onDelete: () => void;
  onExport: () => void;
  generateLoading: boolean;
  deleteLoading: boolean;
  exportLoading: boolean;
  closureStatus?: ClosureStatus;
}

export const PayrollRunActions: React.FC<PayrollRunActionsProps> = ({
  isDraft,
  lineCount,
  canManage,
  canExport,
  onGenerate,
  onFinalize,
  onDelete,
  onExport,
  generateLoading,
  deleteLoading,
  exportLoading,
  closureStatus,
}) => {
  const navigate = useNavigate();
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const closureBlocksFinalize =
    closureStatus?.requires_tl_closed_before_finalize === true && !closureStatus.all_closed;
  const closureWarning =
    closureStatus && !closureStatus.all_closed
      ? `TL closure is incomplete for ${closureStatus.unclosed_users.length} user${closureStatus.unclosed_users.length === 1 ? "" : "s"}.`
      : null;

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => navigate("/admin/payroll/runs")}>
          Back
        </Button>
        {isDraft && canManage && (
          <Button
            variant="outline"
            onClick={onGenerate}
            disabled={generateLoading}
            title="Recalculate all employees"
          >
            {generateLoading ? "Regenerating..." : "Regenerate"}
          </Button>
        )}
        {isDraft && canManage && (
          <Button
            variant="destructive"
            onClick={() => setConfirmDelete(true)}
            disabled={deleteLoading}
            title="Delete this draft payroll run and remove its draft source entries"
          >
            {deleteLoading ? "Deleting..." : "Delete draft"}
          </Button>
        )}
        {isDraft && canManage && (
          <Button
            onClick={() => setConfirmFinalize(true)}
            disabled={lineCount === 0 || closureBlocksFinalize}
            title={
              closureBlocksFinalize
                ? "Finalize is blocked until all team-leader scopes are closed"
                : undefined
            }
          >
            Finalize
          </Button>
        )}
        {canExport && (
          <Button
            variant="outline"
            onClick={onExport}
            disabled={exportLoading || lineCount === 0}
            title="Export all employees as Excel (finalized runs only)"
          >
            {exportLoading ? "Exporting..." : "Export Excel"}
          </Button>
        )}
      </div>

      {closureBlocksFinalize && (
        <p className="mt-2 text-right text-xs text-amber-700 dark:text-amber-300">
          Finalize is disabled until all team-leader scopes are closed.
        </p>
      )}

      {canManage && (
        <>
          <ConfirmDialog
            open={confirmFinalize}
            onOpenChange={() => setConfirmFinalize(false)}
            title="Finalize Payroll Run"
            description={`Finalizing makes this run immutable. Corrections will require a new run. ${closureWarning && !closureStatus?.requires_tl_closed_before_finalize ? `${closureWarning} The current rule allows finalization, but source entries may remain unclosed. ` : ""}Continue?`}
            onConfirm={() => {
              onFinalize();
              setConfirmFinalize(false);
            }}
          />
          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={() => setConfirmDelete(false)}
            title="Delete Draft Payroll Run"
            description="This removes the draft payroll run, its draft payroll lines, and its draft source entries. It does not delete the original overtime or standby records. Continue?"
            onConfirm={() => {
              onDelete();
              setConfirmDelete(false);
            }}
            variant="destructive"
          />
        </>
      )}
    </>
  );
};
