import React from "react";
import { Button } from "@/components/ui/button";
import { Check, X, Eye } from "lucide-react";

interface ApprovalActionsWithViewProps {
  status: string;
  /** Row identity for accessible names, e.g. "Approve alice". */
  itemLabel: string;
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
  itemLabel,
  onView,
  onApprove,
  onReject,
}) => {
  if (status !== "pending") {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11"
        onClick={onView}
        aria-label={`View details for ${itemLabel}`}
      >
        <Eye className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        size="sm"
        onClick={onApprove}
        aria-label={`Approve ${itemLabel}`}
      >
        <Check className="h-4 w-4" aria-hidden="true" />
        Approve
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onReject}
        aria-label={`Reject ${itemLabel}`}
      >
        <X className="h-4 w-4" aria-hidden="true" />
        Reject
      </Button>
    </div>
  );
};
