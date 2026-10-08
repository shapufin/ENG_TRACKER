import React, { useState } from "react";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { FormDialog } from "@/components/ui/FormDialog";
import { InfoCallout } from "@/components/ui/InfoCallout";
import { Textarea } from "@/components/ui/textarea";
import type { PromotionFlag } from "../types/tlScorecard";
import { MemberSelectField } from "./MemberSelectField";
import { useTeamMemberOptions } from "./useTeamMemberOptions";

interface NominatePromotionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: { employee: number; nominated_on: string; notes: string }) => Promise<void>;
  /** In edit mode the employee is fixed and `onCreate` receives the edited values. */
  mode?: "create" | "edit";
  initial?: PromotionFlag;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export const NominatePromotionDialog: React.FC<NominatePromotionDialogProps> = ({
  open,
  onOpenChange,
  onCreate,
  mode = "create",
  initial,
}) => {
  const isEdit = mode === "edit";
  const [employeeId, setEmployeeId] = useState<number | null>(initial?.employee ?? null);
  const { options: memberOptions, loadError } = useTeamMemberOptions(open, !isEdit);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = employeeId !== null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || employeeId === null) return;
    setIsSubmitting(true);
    try {
      await onCreate({
        employee: employeeId,
        nominated_on: initial?.nominated_on ?? todayIso(),
        notes,
      });
      if (!isEdit) {
        setEmployeeId(null);
        setNotes("");
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
      title={isEdit ? "Edit nomination" : "Nominate for promotion"}
      description="Flags a high-potential member for HR review — the employee is never notified."
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel={isEdit ? "Save changes" : "Nominate"}
      submitDisabled={!canSubmit}
      size="md"
    >
      <div className="space-y-4">
        {isEdit ? (
          <InfoCallout
            tone="neutral"
            label={
              <span className="text-muted-foreground">
                Team member:{" "}
                <span className="text-foreground font-medium">{initial?.employee_name}</span>
              </span>
            }
          />
        ) : (
          <MemberSelectField
            id="promo-employee"
            value={employeeId}
            options={memberOptions}
            onChange={setEmployeeId}
            loadError={loadError}
          />
        )}

        <div className="space-y-2">
          <FieldLabel htmlFor="promo-notes">Why this person is high-potential</FieldLabel>
          <Textarea
            id="promo-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>
      </div>
    </FormDialog>
  );
};
