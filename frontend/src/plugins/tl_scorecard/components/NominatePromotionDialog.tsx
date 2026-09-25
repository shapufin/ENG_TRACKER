import React, { useEffect, useState } from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { userService } from "@/services/userService";
import type { UserProfile } from "@/types";

interface NominatePromotionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: { employee: number; nominated_on: string; notes: string }) => Promise<void>;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export const NominatePromotionDialog: React.FC<NominatePromotionDialogProps> = ({
  open,
  onOpenChange,
  onCreate,
}) => {
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    userService.getMyTeamMembers().then(setTeamMembers).catch(() => setTeamMembers([]));
  }, [open]);

  const canSubmit = employeeId !== null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || employeeId === null) return;
    setIsSubmitting(true);
    try {
      await onCreate({ employee: employeeId, nominated_on: todayIso(), notes });
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
      title="Nominate for promotion"
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel="Nominate"
      submitDisabled={!canSubmit}
      size="sm"
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="promo-employee">Team member</Label>
          <select
            id="promo-employee"
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
          <Label htmlFor="promo-notes">Why this person is high-potential</Label>
          <Textarea id="promo-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>
      </div>
    </FormDialog>
  );
};
