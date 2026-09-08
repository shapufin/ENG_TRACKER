import React from "react";
import { Button } from "@/components/ui/button";
import { Check, X, Eye } from "lucide-react";

interface ApprovalActionsWithViewProps {
  status: string;
  onView: () => void;
  onApprove: () => void;
  onReject: () => void;
}

/**
 * Reusable approval actions column with view button for TL approval dashboard.
 * Shows view, approve, and reject buttons for pending items.
 *
 * Extracted from duplicated code in:
 * - TLApprovalDashboard (3 instances for overtime, standby, leave)
 */
export const ApprovalActionsWithView: React.FC<ApprovalActionsWithViewProps> = ({
  status,
  onView,
  onApprove,
  onReject,
}) => {
  if (status !== "pending") {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11"
        onClick={onView}
        aria-label="View details"
      >
        <Eye className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11 text-success"
        onClick={onApprove}
        aria-label="Approve"
      >
        <Check className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11 text-destructive"
        onClick={onReject}
        aria-label="Reject"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
};
