import React, { useState } from "react";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { FormDialog } from "@/components/ui/FormDialog";
import { InfoCallout } from "@/components/ui/InfoCallout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Absence } from "../types/tlScorecard";
import { MemberSelectField } from "./MemberSelectField";
import { useTeamMemberOptions } from "./useTeamMemberOptions";

interface FlagAbsenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: {
    employee: number;
    absence_date: string;
    reason: string;
    notes: string;
    reference_url?: string;
  }) => Promise<void>;
  /** In edit mode the employee is fixed and `onCreate` receives the edited values. */
  mode?: "create" | "edit";
  initial?: Absence;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export const FlagAbsenceDialog: React.FC<FlagAbsenceDialogProps> = ({
  open,
  onOpenChange,
  onCreate,
  mode = "create",
  initial,
}) => {
  const isEdit = mode === "edit";
  const [employeeId, setEmployeeId] = useState<number | null>(initial?.employee ?? null);
  const { options: memberOptions, loadError } = useTeamMemberOptions(open, !isEdit);
  const [absenceDate, setAbsenceDate] = useState(initial?.absence_date ?? todayIso());
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [referenceUrl, setReferenceUrl] = useState(initial?.reference_url ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = employeeId !== null && absenceDate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || employeeId === null) return;
    setIsSubmitting(true);
    try {
      await onCreate({
        employee: employeeId,
        absence_date: absenceDate,
        reason,
        notes,
        reference_url: referenceUrl.trim(),
      });
      if (!isEdit) {
        setEmployeeId(null);
        setReason("");
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
      title={isEdit ? "Edit absence" : "Flag an absence"}
      description="Records an absence for follow-up — the flag is never shown to the employee."
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel={isEdit ? "Save changes" : "Flag absence"}
      submitDisabled={!canSubmit}
      size="sm"
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
            id="absence-employee"
            value={employeeId}
            options={memberOptions}
            onChange={setEmployeeId}
            loadError={loadError}
          />
        )}

        <div className="space-y-2">
          <FieldLabel htmlFor="absence-date" required>
            Date
          </FieldLabel>
          <Input
            id="absence-date"
            type="date"
            value={absenceDate}
            onChange={(e) => setAbsenceDate(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="absence-reason">Reason (if known)</FieldLabel>
          <Input id="absence-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="absence-notes">Notes</FieldLabel>
          <Textarea
            id="absence-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="absence-reference">Reference link</FieldLabel>
          <Input
            id="absence-reference"
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
