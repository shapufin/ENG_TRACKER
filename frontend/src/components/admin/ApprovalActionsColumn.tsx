import React from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle } from "lucide-react";

interface ApprovalActionsColumnProps {
  status: string;
  onApprove: () => void;
  onReject: () => void;
}

/**
 * Reusable approval actions column for admin log pages.
 * Shows approve/reject buttons for pending items, dash for processed items.
 *
 * Extracted from duplicated code in:
 * - LeaveRequestsPage
 * - OvertimeLogsPage
 * - StandbyLogsPage
 */
export const ApprovalActionsColumn: React.FC<ApprovalActionsColumnProps> = ({
  status,
  onApprove,
  onReject,
}) => {
  if (status !== "pending") {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <div className="flex gap-1">
      <Button
        size="sm"
        variant="outline"
        className="h-8 w-8 p-0"
        onClick={onApprove}
        aria-label="Approve"
      >
        <CheckCircle className="h-4 w-4 text-success" />
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 w-8 p-0"
        onClick={onReject}
        aria-label="Reject"
      >
        <XCircle className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
};
