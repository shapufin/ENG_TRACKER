import React, { useState } from "react";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { FormDialog } from "@/components/ui/FormDialog";
import { InfoCallout } from "@/components/ui/InfoCallout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PIPRecord } from "../types/tlScorecard";
import { MemberSelectField } from "./MemberSelectField";
import { useTeamMemberOptions } from "./useTeamMemberOptions";

interface OpenPIPDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: {
    employee: number;
    start_date: string;
    notes: string;
    shared_notes?: string;
    reference_url?: string;
  }) => Promise<void>;
  /** In edit mode the employee is fixed and `onCreate` receives the edited values. */
  mode?: "create" | "edit";
  initial?: PIPRecord;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export const OpenPIPDialog: React.FC<OpenPIPDialogProps> = ({
  open,
  onOpenChange,
  onCreate,
  mode = "create",
  initial,
}) => {
  const isEdit = mode === "edit";
  const [employeeId, setEmployeeId] = useState<number | null>(initial?.employee ?? null);
  const { options: memberOptions, loadError } = useTeamMemberOptions(open, !isEdit);
  const [startDate, setStartDate] = useState(initial?.start_date ?? todayIso());
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [sharedNotes, setSharedNotes] = useState(initial?.shared_notes ?? "");
  const [referenceUrl, setReferenceUrl] = useState(initial?.reference_url ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = employeeId !== null && startDate && notes.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || employeeId === null) return;
    setIsSubmitting(true);
    try {
      await onCreate({
        employee: employeeId,
        start_date: startDate,
        notes: notes.trim(),
        shared_notes: sharedNotes.trim(),
        reference_url: referenceUrl.trim(),
      });
      if (!isEdit) {
        setEmployeeId(null);
        setNotes("");
        setSharedNotes("");
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
      title={isEdit ? "Edit PIP" : "Open a PIP"}
      description={
        isEdit
          ? undefined
          : "Requires prior HR approval before it counts as active — see the approval step below once opened."
      }
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel={isEdit ? "Save changes" : "Open PIP"}
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
            id="pip-employee"
            value={employeeId}
            options={memberOptions}
            onChange={setEmployeeId}
            loadError={loadError}
          />
        )}

        <div className="space-y-2">
          <FieldLabel htmlFor="pip-start-date" required>
            Start date
          </FieldLabel>
          <Input
            id="pip-start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="pip-notes" required>
            Evidence / rationale
          </FieldLabel>
          <Textarea
            id="pip-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="pip-shared-notes">Shared with reviewers</FieldLabel>
          <Textarea
            id="pip-shared-notes"
            value={sharedNotes}
            onChange={(e) => setSharedNotes(e.target.value)}
            placeholder="What HR / your HBPR may read — your notes above stay private."
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="pip-reference">Reference link</FieldLabel>
          <Input
            id="pip-reference"
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
