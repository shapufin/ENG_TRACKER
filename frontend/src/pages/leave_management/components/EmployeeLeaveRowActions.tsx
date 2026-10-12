import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Pencil, Trash2, X } from "lucide-react";
import type { LeaveRequest } from "@/types";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { RowActions, type RowAction } from "@/components/ui/RowActions";

interface EmployeeLeaveRowActionsProps {
  request: LeaveRequest;
  canApprove: boolean;
  onEdit: (req: LeaveRequest) => void;
  onDelete: (id: number) => void;
  canDelete: (req: LeaveRequest) => boolean;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
}

/**
 * Employee leave-request decision cell. Approval decisions stay
 * always-visible inline buttons (never hover-revealed icon actions): a
 * pending decision is the row's whole point. Everything else uses the shared
 * RowActions treatment; delete keeps its ConfirmDialog.
 */
export const EmployeeLeaveRowActions: React.FC<EmployeeLeaveRowActionsProps> = ({
  request,
  canApprove,
  onEdit,
  onDelete,
  canDelete,
  onApprove,
  onReject,
}) => {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { id, status } = request;
  const showDecision = canApprove && status === "pending";
  const deletable = canDelete(request);
  const actions: RowAction[] = [
    {
      label: `Edit request ${id}`,
      icon: Pencil,
      onClick: () => onEdit(request),
    },
  ];
  if (deletable) {
    actions.push({
      label: `Delete request ${id}`,
      icon: Trash2,
      tone: "danger",
      onClick: () => setDeleteOpen(true),
    });
  }
  return (
    <>
      <div className="flex items-center justify-end gap-2">
        {showDecision && (
          <>
            <Button
              type="button"
              size="sm"
              aria-label={`Approve request ${id}`}
              onClick={() => onApprove(id)}
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              Approve
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`Reject request ${id}`}
              onClick={() => onReject(id)}
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Reject
            </Button>
          </>
        )}
        <RowActions actions={actions} />
      </div>
      {deletable && (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="Delete Request"
          description="Delete this request?"
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={() => {
            setDeleteOpen(false);
            onDelete(id);
          }}
        />
      )}
    </>
  );
};
