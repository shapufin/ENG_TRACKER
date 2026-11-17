import React, { useState } from "react";
import { CadenceScheduleFields } from "@/components/hbpr/CadenceScheduleFields";
import type { CadenceScheduleValue } from "@/components/hbpr/CadenceScheduleFields";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { FormDialog } from "@/components/ui/FormDialog";
import type { OneOnOneSchedulePayload, TeamMemberSummary } from "../../types/tlScorecard";

interface OneOnOnePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: TeamMemberSummary[];
  /** Members ticked when the dialog opens. */
  initialIds: number[];
  onSave: (data: OneOnOneSchedulePayload) => Promise<void>;
}

/**
 * Sets the recurring 1-on-1 schedule for one or many team members. It only schedules:
 * every due slot is still confirmed (logged) or skipped with a reason by the leader.
 * Mount it only while open so the fields start from the chosen rows.
 */
export const OneOnOnePlanDialog: React.FC<OneOnOnePlanDialogProps> = ({
  open,
  onOpenChange,
  members,
  initialIds,
  onSave,
}) => {
  const first = members.find((m) => initialIds.includes(m.id))?.meetings.plan ?? null;
  const [selected, setSelected] = useState<number[]>(initialIds);
  const [schedule, setSchedule] = useState<CadenceScheduleValue>({
    cadence: first?.cadence ?? null,
    cadence_day_of_week: first?.cadence_day_of_week ?? null,
    cadence_nth_week: first?.cadence_nth_week ?? null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setField = <K extends keyof CadenceScheduleValue>(key: K, value: CadenceScheduleValue[K]) =>
    setSchedule((prev) => ({ ...prev, [key]: value }));

  const toggle = (id: number, checked: boolean) =>
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  const allChecked = selected.length === members.length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedule.cadence || selected.length === 0) return;
    setIsSubmitting(true);
    try {
      await onSave({
        employee_ids: selected,
        cadence: schedule.cadence,
        cadence_day_of_week:
          schedule.cadence === "monthly" && schedule.cadence_nth_week === null
            ? null
            : schedule.cadence_day_of_week,
        cadence_nth_week: schedule.cadence_nth_week,
      });
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
      size="md"
      title="Set recurring 1-on-1"
      description="Pick the people and how often you meet them. Nothing is logged for you: when a 1-on-1 is due you log it or skip it with a reason."
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel="Save recurring 1-on-1"
      submitDisabled={!schedule.cadence || selected.length === 0}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <FieldLabel htmlFor="oo-plan-all">Team members</FieldLabel>
          <div className="max-h-44 space-y-1 overflow-y-auto overscroll-contain rounded-lg border p-2">
            <label className="flex min-h-8 items-center gap-2 px-1 text-sm font-medium">
              <Checkbox
                id="oo-plan-all"
                checked={allChecked}
                onCheckedChange={(v) => setSelected(v === true ? members.map((m) => m.id) : [])}
              />
              Everyone ({members.length})
            </label>
            {members.map((m) => (
              <label key={m.id} className="flex min-h-8 items-center gap-2 px-1 text-sm">
                <Checkbox
                  checked={selected.includes(m.id)}
                  onCheckedChange={(v) => toggle(m.id, v === true)}
                  aria-label={m.full_name}
                />
                <span className="truncate">{m.full_name}</span>
                {m.meetings.plan && (
                  <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                    {m.meetings.plan.cadence_display}
                  </span>
                )}
              </label>
            ))}
          </div>
        </div>
        <CadenceScheduleFields idPrefix="oo-plan" value={schedule} onFieldChange={setField} />
      </div>
    </FormDialog>
  );
};
