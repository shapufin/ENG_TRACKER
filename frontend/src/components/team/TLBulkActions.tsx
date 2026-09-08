import React from "react";
import { Check, X } from "lucide-react";
import { BulkActionBar } from "@/components/ui/BulkActionBar";

interface TLBulkActionsProps {
  type: "overtime" | "standby" | "leave";
  entityLabel: string;
  selectedCount: number;
  onClear: () => void;
  onApprove: () => void;
  onReject: () => void;
  isPending: boolean;
}

export const TLBulkActions: React.FC<TLBulkActionsProps> = ({
  entityLabel,
  selectedCount,
  onClear,
  onApprove,
  onReject,
  isPending,
}) => (
  <BulkActionBar
    selectedCount={selectedCount}
    entityName={entityLabel}
    onClear={onClear}
    actions={[
      {
        label: "Approve",
        icon: Check,
        onClick: onApprove,
        disabled: isPending,
      },
      {
        label: "Reject",
        icon: X,
        variant: "destructive",
        onClick: onReject,
        disabled: isPending,
      },
    ]}
  />
);
