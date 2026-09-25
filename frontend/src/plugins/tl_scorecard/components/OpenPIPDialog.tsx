import React, { useEffect, useState } from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { userService } from "@/services/userService";
import type { UserProfile } from "@/types";

interface OpenPIPDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: { employee: number; start_date: string; notes: string }) => Promise<void>;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export const OpenPIPDialog: React.FC<OpenPIPDialogProps> = ({ open, onOpenChange, onCreate }) => {
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
  const [startDate, setStartDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    userService.getMyTeamMembers().then(setTeamMembers).catch(() => setTeamMembers([]));
  }, [open]);

  const canSubmit = employeeId !== null && startDate && notes.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || employeeId === null) return;
    setIsSubmitting(true);
    try {
      await onCreate({ employee: employeeId, start_date: startDate, notes: notes.trim() });
      setEmployeeId(null);
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
      title="Open a PIP"
      description="Requires prior HR approval before it counts as active — see the approval step below once opened."
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel="Open PIP"
      submitDisabled={!canSubmit}
      size="sm"
    >
      <div className="space-y-4">
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

        <div>
          <Label htmlFor="pip-start-date">Start date</Label>
          <Input id="pip-start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>

        <div>
          <Label htmlFor="pip-notes">Evidence / rationale</Label>
          <Textarea id="pip-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>
      </div>
    </FormDialog>
  );
};
