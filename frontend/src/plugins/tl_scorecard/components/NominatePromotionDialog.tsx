import React, { useEffect, useState } from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { userService } from "@/services/userService";
import type { UserProfile } from "@/types";
import type { PromotionFlag } from "../types/tlScorecard";

interface NominatePromotionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: { employee: number; nominated_on: string; notes: string }) => Promise<void>;
  /** In edit mode the employee is fixed and `onCreate` receives the edited values. */
  mode?: "create" | "edit";
  initial?: PromotionFlag;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export const NominatePromotionDialog: React.FC<NominatePromotionDialogProps> = ({
  open,
  onOpenChange,
  onCreate,
  mode = "create",
  initial,
}) => {
  const isEdit = mode === "edit";
  const [employeeId, setEmployeeId] = useState<number | null>(initial?.employee ?? null);
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open || isEdit) return;
    userService.getMyTeamMembers().then(setTeamMembers).catch(() => setTeamMembers([]));
  }, [open, isEdit]);

  const canSubmit = employeeId !== null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || employeeId === null) return;
    setIsSubmitting(true);
    try {
      await onCreate({ employee: employeeId, nominated_on: initial?.nominated_on ?? todayIso(), notes });
      if (!isEdit) {
        setEmployeeId(null);
        setNotes("");
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
      title={isEdit ? "Edit nomination" : "Nominate for promotion"}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel={isEdit ? "Save changes" : "Nominate"}
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
        )}

        <div>
          <Label htmlFor="promo-notes">Why this person is high-potential</Label>
          <Textarea id="promo-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>
      </div>
    </FormDialog>
  );
};
