import React, { useState } from "react";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { FormDialog } from "@/components/ui/FormDialog";
import { InfoCallout } from "@/components/ui/InfoCallout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { IdleFlag } from "../types/tlScorecard";
import { MemberSelectField } from "./MemberSelectField";
import { useTeamMemberOptions } from "./useTeamMemberOptions";

interface FlagIdleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: {
    employee: number;
    flagged_on: string;
    productivity_task: string;
    notes: string;
    reference_url?: string;
  }) => Promise<void>;
  /** In edit mode the employee is fixed and `onCreate` receives the edited values. */
  mode?: "create" | "edit";
  initial?: IdleFlag;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export const FlagIdleDialog: React.FC<FlagIdleDialogProps> = ({
  open,
  onOpenChange,
  onCreate,
  mode = "create",
  initial,
}) => {
  const isEdit = mode === "edit";
  const [employeeId, setEmployeeId] = useState<number | null>(initial?.employee ?? null);
  const { options: memberOptions, loadError } = useTeamMemberOptions(open, !isEdit);
  const [flaggedOn, setFlaggedOn] = useState(initial?.flagged_on ?? todayIso());
  const [productivityTask, setProductivityTask] = useState(initial?.productivity_task ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [referenceUrl, setReferenceUrl] = useState(initial?.reference_url ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = employeeId !== null && flaggedOn;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || employeeId === null) return;
    setIsSubmitting(true);
    try {
      await onCreate({
        employee: employeeId,
        flagged_on: flaggedOn,
        productivity_task: productivityTask,
        notes,
        reference_url: referenceUrl.trim(),
      });
      if (!isEdit) {
        setEmployeeId(null);
        setProductivityTask("");
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
      title={isEdit ? "Edit idle flag" : "Flag an idle risk"}
      description="Flags a member without enough assigned work — notes go to HRBP / NS Demand; the employee never sees the flag."
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel={isEdit ? "Save changes" : "Flag idle risk"}
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
            id="idle-employee"
            value={employeeId}
            options={memberOptions}
            onChange={setEmployeeId}
            loadError={loadError}
          />
        )}

        <div className="space-y-2">
          <FieldLabel htmlFor="idle-date" required>
            Flagged on
          </FieldLabel>
          <Input
            id="idle-date"
            type="date"
            value={flaggedOn}
            onChange={(e) => setFlaggedOn(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="idle-task">Productivity task assigned</FieldLabel>
          <Textarea
            id="idle-task"
            value={productivityTask}
            onChange={(e) => setProductivityTask(e.target.value)}
            placeholder="What structured task did you assign while idle..."
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="idle-notes">Notes (for HRBP / NS Demand)</FieldLabel>
          <Textarea
            id="idle-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="idle-reference">Reference link</FieldLabel>
          <Input
            id="idle-reference"
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
