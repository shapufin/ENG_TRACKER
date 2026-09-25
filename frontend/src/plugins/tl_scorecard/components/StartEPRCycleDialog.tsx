import React, { useEffect, useState } from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { Label } from "@/components/ui/label";
import { userService } from "@/services/userService";
import type { UserProfile } from "@/types";

interface StartEPRCycleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: { user: number; year: number }) => Promise<void>;
}

export const StartEPRCycleDialog: React.FC<StartEPRCycleDialogProps> = ({ open, onOpenChange, onCreate }) => {
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const year = new Date().getFullYear();

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
      await onCreate({ user: employeeId, year });
      setEmployeeId(null);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Start ${year} EPR cycle`}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel="Start cycle"
      submitDisabled={!canSubmit}
      size="sm"
    >
      <div>
        <Label htmlFor="epr-employee">Team member</Label>
        <select
          id="epr-employee"
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
    </FormDialog>
  );
};
