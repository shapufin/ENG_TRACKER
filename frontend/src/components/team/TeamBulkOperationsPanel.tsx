import React from "react";
import { Check, Trash2, X } from "lucide-react";
import { BulkActionBar } from "@/components/ui/BulkActionBar";

interface TeamBulkOperationsPanelProps {
  selectedCount: number;
  /** Selected rows that are still pending; Approve and Reject need at least one. */
  pendingSelectedCount?: number;
  onClear: () => void;
  onApprove: () => void;
  onReject: () => void;
  onDelete: () => void;
  canManage: boolean;
  isApproving?: boolean;
  isRejecting?: boolean;
  isDeleting?: boolean;
}

export const TeamBulkOperationsPanel: React.FC<TeamBulkOperationsPanelProps> = ({
  selectedCount,
  pendingSelectedCount = selectedCount,
  onClear,
  onApprove,
  onReject,
  onDelete,
  canManage,
  isApproving = false,
  isRejecting = false,
  isDeleting = false,
}) => {
  const noPending = pendingSelectedCount === 0;
  const noPendingReason = noPending ? "None of the selected records is pending." : undefined;
  return (
    <BulkActionBar
      selectedCount={selectedCount}
      entityName="items"
      onClear={onClear}
      actions={[
        ...(canManage
          ? [
              {
                label: "Approve",
                icon: Check,
                variant: "default" as const,
                onClick: onApprove,
                disabled: isApproving || noPending,
                title: noPendingReason,
              },
              {
                label: "Reject",
                icon: X,
                variant: "outline" as const,
                onClick: onReject,
                disabled: isRejecting || noPending,
                title: noPendingReason,
              },
            ]
          : []),
        {
          label: "Delete",
          icon: Trash2,
          variant: "destructive" as const,
          onClick: onDelete,
          disabled: isDeleting,
        },
      ]}
    />
  );
};
