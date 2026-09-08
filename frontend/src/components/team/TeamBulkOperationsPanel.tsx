import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { CheckSquare, Trash2 } from "lucide-react";

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
}) => {
  return (
    <GlassCard isHoverLift={false} className="mb-4 border-l-4 border-l-primary">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-1.5">
            <CheckSquare className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">{selectedCount}</span>
          </div>
          <span className="text-sm text-muted-foreground">selected</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <>
              <Button size="sm" variant="outline" onClick={onApprove} disabled={isApproving}>
                Approve
              </Button>
              <Button size="sm" variant="outline" onClick={onReject} disabled={isRejecting}>
                Reject
              </Button>
            </>
          )}
          <Button size="sm" variant="destructive" onClick={onDelete} disabled={isDeleting}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear}>
            Clear
          </Button>
        </div>
      </div>
    </GlassCard>
  );
};
