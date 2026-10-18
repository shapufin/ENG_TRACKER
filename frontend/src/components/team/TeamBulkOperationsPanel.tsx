import React from "react";
import { Check, Trash2, X } from "lucide-react";
import { BulkActionBar } from "@/components/ui/BulkActionBar";

interface TeamBulkOperationsPanelProps {
  selectedCount: number;
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
  onClear,
  onApprove,
  onReject,
  onDelete,
  canManage,
  isApproving = false,
  isRejecting = false,
  isDeleting = false,
}) => (
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
              disabled: isApproving,
            },
            {
              label: "Reject",
              icon: X,
              variant: "outline" as const,
              onClick: onReject,
              disabled: isRejecting,
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
