import React, { useState } from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { IdleFlag } from "../../types/tlScorecard";

interface LogIdleStatusUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flag: IdleFlag;
  onSubmit: (data: {
    week_of: string;
    status_note: string;
    productivity_task_snapshot: string;
  }) => Promise<void>;
}

/** Monday of the current week — `week_of` is the Monday of the reported week. */
const currentMonday = () => {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
};

/** One weekly check-in entry against an idle flag (POST /idle-status-updates/). */
export const LogIdleStatusUpdateDialog: React.FC<LogIdleStatusUpdateDialogProps> = ({
  open,
  onOpenChange,
  flag,
  onSubmit,
}) => {
  const [weekOf, setWeekOf] = useState(currentMonday());
  const [statusNote, setStatusNote] = useState("");
  const [task, setTask] = useState(flag.productivity_task);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = weekOf && statusNote.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await onSubmit({
        week_of: weekOf,
        status_note: statusNote.trim(),
        productivity_task_snapshot: task.trim(),
      });
      onOpenChange(false);
    } catch {
      // The caller already reported the failure (e.g. a duplicate week); keep the dialog open.
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Log weekly update"
      description={`Weekly check-in for the idle flag on ${flag.employee_name ?? "this member"}.`}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel="Log update"
      submitDisabled={!canSubmit}
      size="sm"
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="idle-update-week">Week starting (Monday)</Label>
          <Input
            id="idle-update-week"
            type="date"
            value={weekOf}
            onChange={(e) => setWeekOf(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="idle-update-note">Status note</Label>
          <Textarea
            id="idle-update-note"
            value={statusNote}
            onChange={(e) => setStatusNote(e.target.value)}
            placeholder="What happened this week..."
            rows={3}
          />
        </div>
        <div>
          <Label htmlFor="idle-update-task">Assigned task this week (optional)</Label>
          <Textarea
            id="idle-update-task"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={2}
          />
        </div>
      </div>
    </FormDialog>
  );
};
