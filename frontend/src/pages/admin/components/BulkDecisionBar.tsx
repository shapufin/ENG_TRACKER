import React, { useState } from "react";
import { Check, X } from "lucide-react";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { RejectionReasonDialog } from "./RejectionReasonDialog";

export interface BulkDecisions {
  approve: (ids: number[]) => Promise<boolean>;
  reject: (ids: number[], reason: string) => Promise<boolean>;
  isPending: boolean;
}

interface BulkDecisionBarProps {
  selectedCount: number;
  /** Selected rows still awaiting a decision; decided rows are ignored. */
  pendingIds: number[];
  bulk: BulkDecisions;
  entityName: string;
  onClear: () => void;
}

/** Floating approve/reject dock for admin approval tables; clears the selection once a decision succeeds. */
export const BulkDecisionBar: React.FC<BulkDecisionBarProps> = ({
  selectedCount,
  pendingIds,
  bulk,
  entityName,
  onClear,
}) => {
  const [rejectOpen, setRejectOpen] = useState(false);
  const disabled = bulk.isPending || pendingIds.length === 0;
  const decide = async (action: Promise<boolean>) => {
    if (await action) onClear();
  };

  return (
    <>
      <BulkActionBar
        selectedCount={selectedCount}
        onClear={onClear}
        entityName={entityName}
        actions={[
          {
            label: `Approve ${pendingIds.length} pending`,
            icon: Check,
            disabled,
            onClick: () => void decide(bulk.approve(pendingIds)),
          },
          {
            label: "Reject",
            icon: X,
            variant: "destructive",
            disabled,
            onClick: () => setRejectOpen(true),
          },
        ]}
      />
      <RejectionReasonDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        onConfirm={(reason) => {
          setRejectOpen(false);
          void decide(bulk.reject(pendingIds, reason));
        }}
      />
    </>
  );
};
