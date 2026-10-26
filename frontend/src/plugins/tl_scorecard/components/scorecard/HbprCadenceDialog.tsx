import React, { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { CadenceScheduleFields } from "@/components/hbpr/CadenceScheduleFields";
import type { CadenceScheduleValue } from "@/components/hbpr/CadenceScheduleFields";
import { FormDialog } from "@/components/ui/FormDialog";
import { calculateNextCadenceOccurrence } from "@/types/hbprAssignment";
import type { HbprCadencePayload, HbprPartnershipAssignment } from "../../types/tlScorecard";
import { formatDate } from "../hbpr/hbprMeta";

interface HbprCadenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment: HbprPartnershipAssignment;
  onSave: (data: HbprCadencePayload) => Promise<void>;
}

/**
 * Lets the assigned Albanian TL change how often they meet their HBPR. The
 * change is audit-logged server-side; past entries keep their dates.
 */
export const HbprCadenceDialog: React.FC<HbprCadenceDialogProps> = ({
  open,
  onOpenChange,
  assignment,
  onSave,
}) => {
  const [schedule, setSchedule] = useState<CadenceScheduleValue>({
    cadence: assignment.cadence,
    cadence_day_of_week: assignment.cadence_day_of_week,
    cadence_nth_week: assignment.cadence_nth_week,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setField = <K extends keyof CadenceScheduleValue>(key: K, value: CadenceScheduleValue[K]) =>
    setSchedule((prev) => ({ ...prev, [key]: value }));

  // A monthly "day of month" schedule has no weekday; drop a stale one left
  // over from a weekly pattern so the server never stores a dangling value.
  const payload: HbprCadencePayload = {
    ...schedule,
    cadence_day_of_week:
      schedule.cadence === "monthly" && schedule.cadence_nth_week === null
        ? null
        : schedule.cadence_day_of_week,
  };

  const preview = useMemo(
    () =>
      calculateNextCadenceOccurrence({
        cadence: payload.cadence,
        cadenceDayOfWeek: payload.cadence_day_of_week,
        cadenceNthWeek: payload.cadence_nth_week,
        anchorDate: assignment.last_meeting_on ?? assignment.effective_from,
      }),
    [
      payload.cadence,
      payload.cadence_day_of_week,
      payload.cadence_nth_week,
      assignment.last_meeting_on,
      assignment.effective_from,
    ]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSave(payload);
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
      title="Change meeting schedule"
      description="How often you meet your HR business partner. Past log entries keep their dates; the change is recorded."
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel="Save schedule"
    >
      <div className="space-y-4">
        <CadenceScheduleFields idPrefix="hbpr-cadence" value={schedule} onFieldChange={setField} />
        {preview && (
          <div className="bg-surface-sunken flex items-center gap-2 rounded-lg border p-2.5 text-xs">
            <CalendarDays className="text-primary h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="text-muted-foreground">
              {assignment.last_meeting_on
                ? "Next meeting after your last one: "
                : "First meeting: "}
            </span>
            <span className="text-foreground font-semibold">{formatDate(preview)}</span>
          </div>
        )}
      </div>
    </FormDialog>
  );
};
