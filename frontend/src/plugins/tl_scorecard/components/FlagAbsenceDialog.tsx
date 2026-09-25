import React, { useEffect, useState } from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { userService } from "@/services/userService";
import type { UserProfile } from "@/types";

interface FlagAbsenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: { employee: number; absence_date: string; reason: string; notes: string }) => Promise<void>;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export const FlagAbsenceDialog: React.FC<FlagAbsenceDialogProps> = ({ open, onOpenChange, onCreate }) => {
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
  const [absenceDate, setAbsenceDate] = useState(todayIso());
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    userService.getMyTeamMembers().then(setTeamMembers).catch(() => setTeamMembers([]));
  }, [open]);

  const canSubmit = employeeId !== null && absenceDate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || employeeId === null) return;
    setIsSubmitting(true);
    try {
      await onCreate({ employee: employeeId, absence_date: absenceDate, reason, notes });
      setEmployeeId(null);
      setReason("");
      setNotes("");
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Flag an absence"
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel="Flag absence"
      submitDisabled={!canSubmit}
      size="sm"
    >
      <div className="space-y-4">
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
      </div>
    </FormDialog>
  );
};
