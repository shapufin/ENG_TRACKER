import React, { useEffect, useState } from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { userService } from "@/services/userService";
import type { UserProfile } from "@/types";
import type { IdleFlag } from "../types/tlScorecard";

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

export const FlagIdleDialog: React.FC<FlagIdleDialogProps> = ({ open, onOpenChange, onCreate, mode = "create", initial }) => {
  const isEdit = mode === "edit";
  const [employeeId, setEmployeeId] = useState<number | null>(initial?.employee ?? null);
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
  const [flaggedOn, setFlaggedOn] = useState(initial?.flagged_on ?? todayIso());
  const [productivityTask, setProductivityTask] = useState(initial?.productivity_task ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [referenceUrl, setReferenceUrl] = useState(initial?.reference_url ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open || isEdit) return;
    userService.getMyTeamMembers().then(setTeamMembers).catch(() => setTeamMembers([]));
  }, [open, isEdit]);

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
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel={isEdit ? "Save changes" : "Flag idle risk"}
      submitDisabled={!canSubmit}
      size="sm"
    >
      <div className="space-y-4">
        {isEdit ? (
          <p className="text-sm">
            <span className="text-muted-foreground">Team member: </span>
            {initial?.employee_name}
          </p>
        ) : (
          <div>
            <Label htmlFor="idle-employee">Team member</Label>
            <select
              id="idle-employee"
              className="h-9 w-full rounded-xl border border-border bg-card px-2 text-sm text-foreground"
              value={employeeId ?? ""}
              onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Select a team member...</option>
              {teamMembers.map((profile) => (
                <option key={profile.user.id} value={profile.user.id}>
                  {profile.user.full_name || profile.user.username}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <Label htmlFor="idle-date">Flagged on</Label>
          <Input id="idle-date" type="date" value={flaggedOn} onChange={(e) => setFlaggedOn(e.target.value)} />
        </div>

        <div>
          <Label htmlFor="idle-task">Productivity task assigned</Label>
          <Textarea
            id="idle-task"
            value={productivityTask}
            onChange={(e) => setProductivityTask(e.target.value)}
            placeholder="What structured task did you assign while idle..."
            rows={2}
          />
        </div>

        <div>
          <Label htmlFor="idle-notes">Notes (for HRBP / NS Demand)</Label>
          <Textarea id="idle-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        <div>
          <Label htmlFor="idle-reference">Reference link (optional)</Label>
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
