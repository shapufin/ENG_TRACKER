import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

interface EventApprovalActionsProps {
  onApprove: () => void;
  onReject: (reason: string) => void;
  isSubmitting: boolean;
  canApprove: boolean;
}

/**
 * Approval/reject actions for calendar events.
 * Handles the UI and validation for approving/rejecting events.
 *
 * Extracted from EventActionModal to reduce complexity.
 */
export const EventApprovalActions: React.FC<EventApprovalActionsProps> = ({
  onApprove,
  onReject,
  isSubmitting,
  canApprove,
}) => {
  const [rejectReason, setRejectReason] = useState("");

  const handleReject = () => {
    if (!rejectReason.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }
    onReject(rejectReason);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="reject-reason">Rejection Reason</Label>
        <Input
          id="reject-reason"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Enter reason for rejection..."
          className="w-full"
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onApprove} disabled={!canApprove || isSubmitting}>
          <Check className="mr-2 h-4 w-4" />
          {isSubmitting ? "Processing..." : "Approve"}
        </Button>
        <Button variant="destructive" onClick={handleReject} disabled={isSubmitting}>
          <X className="mr-2 h-4 w-4" />
          {isSubmitting ? "Processing..." : "Reject"}
        </Button>
      </div>
    </div>
  );
};
