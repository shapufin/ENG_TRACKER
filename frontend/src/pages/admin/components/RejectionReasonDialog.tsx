import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface RejectionReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}

export const RejectionReasonDialog: React.FC<RejectionReasonDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
}) => {
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    if (reason.trim()) {
      onConfirm(reason.trim());
      setReason("");
    }
  };

  const handleClose = () => {
    setReason("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[90vh] max-w-md flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Reject Overtime Entry</DialogTitle>
          <DialogDescription>Please provide a reason for rejection</DialogDescription>
        </DialogHeader>
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-1 py-1">
          <div className="space-y-2">
            <Label htmlFor="rejection-reason">Rejection reason</Label>
            <Textarea
              id="rejection-reason"
              placeholder="Enter rejection reason..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
            />
          </div>
        </div>
        <DialogFooter className="shrink-0 border-t pt-4">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!reason.trim()}>
            Confirm Rejection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
