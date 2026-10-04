import React, { useEffect, useState } from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { userService } from "@/services/userService";
import type { UserProfile } from "@/types";
import type { Absence } from "../types/tlScorecard";

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

export const FlagAbsenceDialog: React.FC<FlagAbsenceDialogProps> = ({ open, onOpenChange, onCreate, mode = "create", initial }) => {
  const isEdit = mode === "edit";
  const [employeeId, setEmployeeId] = useState<number | null>(initial?.employee ?? null);
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
  const [absenceDate, setAbsenceDate] = useState(initial?.absence_date ?? todayIso());
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [referenceUrl, setReferenceUrl] = useState(initial?.reference_url ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open || isEdit) return;
    userService.getMyTeamMembers().then(setTeamMembers).catch(() => setTeamMembers([]));
  }, [open, isEdit]);

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
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel={isEdit ? "Save changes" : "Flag absence"}
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
            <Label htmlFor="absence-employee">Team member</Label>
            <select
              id="absence-employee"
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
          <Label htmlFor="absence-date">Date</Label>
          <Input id="absence-date" type="date" value={absenceDate} onChange={(e) => setAbsenceDate(e.target.value)} />
        </div>

        <div>
          <Label htmlFor="absence-reason">Reason (if known)</Label>
          <Input id="absence-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>

        <div>
          <Label htmlFor="absence-notes">Notes</Label>
          <Textarea id="absence-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        <div>
          <Label htmlFor="absence-reference">Reference link (optional)</Label>
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
