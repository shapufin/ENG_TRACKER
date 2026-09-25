import React, { useState } from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LogReviewDeliveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: { period: string; recipient: string; delivered_on: string }) => Promise<void>;
}

const currentPeriod = () => new Date().toISOString().slice(0, 7);
const todayIso = () => new Date().toISOString().slice(0, 10);

export const LogReviewDeliveryDialog: React.FC<LogReviewDeliveryDialogProps> = ({
  open,
  onOpenChange,
  onCreate,
}) => {
  const [period, setPeriod] = useState(currentPeriod());
  const [recipient, setRecipient] = useState("");
  const [deliveredOn, setDeliveredOn] = useState(todayIso());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = /^\d{4}-\d{2}$/.test(period) && recipient.trim() && deliveredOn;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await onCreate({ period, recipient: recipient.trim(), delivered_on: deliveredOn });
      setRecipient("");
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Log a management review delivery"
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel="Log delivery"
      submitDisabled={!canSubmit}
      size="sm"
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="review-period">Period (YYYY-MM)</Label>
          <Input
            id="review-period"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder="2026-09"
          />
        </div>
        <div>
          <Label htmlFor="review-recipient">Recipient</Label>
          <Input
            id="review-recipient"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="e.g. Ops, GM"
          />
        </div>
        <div>
          <Label htmlFor="review-delivered-on">Delivered on</Label>
          <Input
            id="review-delivered-on"
            type="date"
            value={deliveredOn}
            onChange={(e) => setDeliveredOn(e.target.value)}
          />
        </div>
      </div>
    </FormDialog>
  );
};
