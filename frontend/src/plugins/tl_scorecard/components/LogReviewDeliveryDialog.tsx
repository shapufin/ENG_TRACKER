import React, { useState } from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ReviewDelivery } from "../types/tlScorecard";

interface LogReviewDeliveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: { period: string; recipient: string; delivered_on: string }) => Promise<void>;
  /** In edit mode `onCreate` receives the edited values. */
  mode?: "create" | "edit";
  initial?: ReviewDelivery;
}

const currentPeriod = () => new Date().toISOString().slice(0, 7);
const todayIso = () => new Date().toISOString().slice(0, 10);

export const LogReviewDeliveryDialog: React.FC<LogReviewDeliveryDialogProps> = ({
  open,
  onOpenChange,
  onCreate,
  mode = "create",
  initial,
}) => {
  const isEdit = mode === "edit";
  const [period, setPeriod] = useState(initial?.period ?? currentPeriod());
  const [recipient, setRecipient] = useState(initial?.recipient ?? "");
  const [deliveredOn, setDeliveredOn] = useState(initial?.delivered_on ?? todayIso());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = /^\d{4}-\d{2}$/.test(period) && recipient.trim() && deliveredOn;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await onCreate({ period, recipient: recipient.trim(), delivered_on: deliveredOn });
      if (!isEdit) setRecipient("");
      onOpenChange(false);
    } catch {
      // The caller reports the failure; keep the dialog open for a retry.
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit review delivery" : "Log a management review delivery"}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel={isEdit ? "Save changes" : "Log delivery"}
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
