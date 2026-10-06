import React, { useState } from "react";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { FormDialog } from "@/components/ui/FormDialog";
import { Textarea } from "@/components/ui/textarea";

interface NoteActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fieldLabel: string;
  submitLabel: string;
  required: boolean;
  onSubmit: (note: string) => Promise<void>;
}

/** One free-text field behind a state action (share summary, return reason, decision note...). */
export const NoteActionDialog: React.FC<NoteActionDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  fieldLabel,
  submitLabel,
  required,
  onSubmit,
}) => {
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit(note.trim());
      onOpenChange(false);
    } catch {
      // The caller already showed the failure; keep the dialog open for a retry.
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel={submitLabel}
      submitDisabled={required && !note.trim()}
      size="sm"
    >
      <div className="space-y-2">
        <FieldLabel htmlFor="record-action-note" required={required}>
          {fieldLabel}
        </FieldLabel>
        <Textarea
          id="record-action-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
        />
      </div>
    </FormDialog>
  );
};
