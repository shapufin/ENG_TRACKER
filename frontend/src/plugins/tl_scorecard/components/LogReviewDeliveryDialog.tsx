import React, { useState } from "react";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { FormDialog } from "@/components/ui/FormDialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ReviewDelivery } from "../types/tlScorecard";

interface LogReviewDeliveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: {
    period: string;
    recipient: string;
    delivered_on: string;
    notes?: string;
    reference_url?: string;
  }) => Promise<void>;
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
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [referenceUrl, setReferenceUrl] = useState(initial?.reference_url ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = /^\d{4}-\d{2}$/.test(period) && recipient.trim() && deliveredOn;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await onCreate({
        period,
        recipient: recipient.trim(),
        delivered_on: deliveredOn,
        notes,
        reference_url: referenceUrl.trim(),
      });
      if (!isEdit) {
        setRecipient("");
        setNotes("");
        setReferenceUrl("");
      }
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
      description="Record that a management review was delivered for a month. It counts toward the 12-per-year target; notes stay private to you and staff."
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel={isEdit ? "Save changes" : "Log delivery"}
      submitDisabled={!canSubmit}
      size="sm"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <FieldLabel htmlFor="review-period" required>
            Period
          </FieldLabel>
          <Input
            id="review-period"
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder="2026-09"
          />
        </div>
        <div className="space-y-2">
          <FieldLabel htmlFor="review-recipient" required>
            Recipient
          </FieldLabel>
          <Input
            id="review-recipient"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="e.g. Ops, GM"
          />
        </div>
        <div className="space-y-2">
          <FieldLabel htmlFor="review-delivered-on" required>
            Delivered on
          </FieldLabel>
          <Input
            id="review-delivered-on"
            type="date"
            value={deliveredOn}
            onChange={(e) => setDeliveredOn(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <FieldLabel htmlFor="review-notes">Notes (private)</FieldLabel>
          <Textarea
            id="review-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What was covered, decisions taken..."
            rows={3}
          />
        </div>
        <div className="space-y-2">
          <FieldLabel htmlFor="review-reference">Reference link</FieldLabel>
          <Input
            id="review-reference"
            type="url"
            value={referenceUrl}
            onChange={(e) => setReferenceUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>
      </div>
    </FormDialog>
  );
};
