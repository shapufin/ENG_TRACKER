import React, { useEffect, useState } from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { userService } from "@/services/userService";
import type { UserProfile } from "@/types";
import type { PIPRecord } from "../types/tlScorecard";

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

export const OpenPIPDialog: React.FC<OpenPIPDialogProps> = ({ open, onOpenChange, onCreate, mode = "create", initial }) => {
  const isEdit = mode === "edit";
  const [employeeId, setEmployeeId] = useState<number | null>(initial?.employee ?? null);
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
  const [startDate, setStartDate] = useState(initial?.start_date ?? todayIso());
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [sharedNotes, setSharedNotes] = useState(initial?.shared_notes ?? "");
  const [referenceUrl, setReferenceUrl] = useState(initial?.reference_url ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open || isEdit) return;
    userService.getMyTeamMembers().then(setTeamMembers).catch(() => setTeamMembers([]));
  }, [open, isEdit]);

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
        isEdit ? undefined : "Requires prior HR approval before it counts as active — see the approval step below once opened."
      }
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel={isEdit ? "Save changes" : "Open PIP"}
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
            <Label htmlFor="pip-employee">Team member</Label>
            <select
              id="pip-employee"
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
          <Label htmlFor="pip-start-date">Start date</Label>
          <Input id="pip-start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>

        <div>
          <Label htmlFor="pip-notes">Evidence / rationale</Label>
          <Textarea id="pip-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>

        <div>
          <Label htmlFor="pip-shared-notes">Shared with reviewers (optional)</Label>
          <Textarea
            id="pip-shared-notes"
            value={sharedNotes}
            onChange={(e) => setSharedNotes(e.target.value)}
            placeholder="What HR / your HBPR may read — the evidence above stays private."
            rows={2}
          />
        </div>

        <div>
          <Label htmlFor="pip-reference">Reference link (optional)</Label>
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
