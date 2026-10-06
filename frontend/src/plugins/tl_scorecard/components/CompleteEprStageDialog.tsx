import React, { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { FormDialog } from "@/components/ui/FormDialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface CompleteEprStageValues {
  summary: string;
  reference_url: string;
  shared_with_employee: boolean;
}

interface CompleteEprStageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Human-readable stage name shown in the title, e.g. "Mid-year". */
  stageLabel: string;
  onSave: (values: CompleteEprStageValues) => Promise<void>;
}

/**
 * The only way a stage's `*_completed_at` gets set: the backend `complete_stage`
 * action stamps it AND records this evidence atomically — a bare click is not
 * evidence. The summary is required; "Share with employee" publishes it on the
 * employee's My Records page.
 */
export const CompleteEprStageDialog: React.FC<CompleteEprStageDialogProps> = ({
  open,
  onOpenChange,
  stageLabel,
  onSave,
}) => {
  const [summary, setSummary] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [shared, setShared] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = Boolean(summary.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await onSave({
        summary: summary.trim(),
        reference_url: referenceUrl.trim(),
        shared_with_employee: shared,
      });
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
      title={`Complete ${stageLabel}`}
      description="Record the evidence for this stage — what was agreed, and where the review artifact lives."
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel="Complete stage"
      submitDisabled={!canSubmit}
      size="md"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <FieldLabel htmlFor="epr-stage-summary" required>
            Summary
          </FieldLabel>
          <Textarea
            id="epr-stage-summary"
            rows={4}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="What was discussed and agreed at this stage."
          />
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="epr-stage-reference">Reference link</FieldLabel>
          <Input
            id="epr-stage-reference"
            type="url"
            value={referenceUrl}
            onChange={(e) => setReferenceUrl(e.target.value)}
            placeholder="https://… (e.g. the Workday review)"
          />
        </div>

        <label
          htmlFor="epr-stage-share"
          className="flex cursor-pointer items-start gap-2.5 text-sm"
        >
          <Checkbox
            id="epr-stage-share"
            className="mt-0.5"
            checked={shared}
            onCheckedChange={(checked) => setShared(checked === true)}
          />
          <span>
            Share with employee
            <span className="text-muted-foreground block text-xs">
              The summary appears on their My Records page.
            </span>
          </span>
        </label>
      </div>
    </FormDialog>
  );
};
