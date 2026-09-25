import React, { useEffect, useState } from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { userService } from "@/services/userService";
import type { UserProfile } from "@/types";

interface FlagIdleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: {
    employee: number;
    flagged_on: string;
    productivity_task: string;
    notes: string;
  }) => Promise<void>;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export const FlagIdleDialog: React.FC<FlagIdleDialogProps> = ({ open, onOpenChange, onCreate }) => {
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
  const [flaggedOn, setFlaggedOn] = useState(todayIso());
  const [productivityTask, setProductivityTask] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    userService.getMyTeamMembers().then(setTeamMembers).catch(() => setTeamMembers([]));
  }, [open]);

  const canSubmit = employeeId !== null && flaggedOn;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || employeeId === null) return;
    setIsSubmitting(true);
    try {
      await onCreate({ employee: employeeId, flagged_on: flaggedOn, productivity_task: productivityTask, notes });
      setEmployeeId(null);
      setProductivityTask("");
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
      title="Flag an idle risk"
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel="Flag idle risk"
      submitDisabled={!canSubmit}
      size="sm"
    >
      <div className="space-y-4">
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
      </div>
    </FormDialog>
  );
};
