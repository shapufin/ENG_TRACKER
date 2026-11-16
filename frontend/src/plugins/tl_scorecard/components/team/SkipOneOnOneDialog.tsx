import React, { useState } from "react";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { FormDialog } from "@/components/ui/FormDialog";
import { Textarea } from "@/components/ui/textarea";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";

interface SkipOneOnOneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeName: string;
  dueOn: string;
  onSkip: (reason: string) => Promise<void>;
}

/** A skipped 1-on-1 needs a reason. It is not a held meeting and does not count as one. */
export const SkipOneOnOneDialog: React.FC<SkipOneOnOneDialogProps> = ({
  open,
  onOpenChange,
  employeeName,
  dueOn,
  onSkip,
}) => {
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    setIsSubmitting(true);
    try {
      await onSkip(reason.trim());
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
      size="md"
      title="Skip this 1-on-1"
      description={`${employeeName}, due ${formatDateDDMMYYYY(dueOn)}. A skipped 1-on-1 moves the schedule on but does not count as held.`}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel="Skip 1-on-1"
      submitDisabled={!reason.trim()}
    >
      <div className="space-y-2">
        <FieldLabel htmlFor="oo-skip-reason" required>
          Reason
        </FieldLabel>
        <Textarea
          id="oo-skip-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why this 1-on-1 will not happen..."
          rows={3}
        />
      </div>
    </FormDialog>
  );
};
