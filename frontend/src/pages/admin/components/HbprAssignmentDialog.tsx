import React, { useMemo } from "react";
import { CalendarDays, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/FormDialog";
import { FormField } from "@/components/ui/FormField";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { calculateNextCadenceOccurrence } from "@/types/hbprAssignment";
import type { HbprAssignment, HbprCadence, HbprPersonRef } from "@/types/hbprAssignment";
import { CadenceScheduleFields } from "@/components/hbpr/CadenceScheduleFields";

export interface HbprAssignmentForm {
  hbpr: number | null;
  albanian_tl: number | null;
  cadence: HbprCadence;
  cadence_day_of_week: number | null;
  cadence_nth_week: number | null;
  effective_from: string;
}

interface HbprAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "create" | "edit";
  editingAssignment?: HbprAssignment | null;
  hbprOptions: HbprPersonRef[];
  albanianTlOptions: HbprPersonRef[];
  form: HbprAssignmentForm;
  formErrors: Record<string, string>;
  onFieldChange: <K extends keyof HbprAssignmentForm>(key: K, value: HbprAssignmentForm[K]) => void;
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting: boolean;
}

const PersonSelect: React.FC<{
  id: string;
  label: string;
  value: number | null;
  options: HbprPersonRef[];
  placeholder: string;
  onChange: (id: number) => void;
}> = ({ id, label, value, options, placeholder, onChange }) => (
  <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <Select value={value ? String(value) : undefined} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger id={id} aria-label={label} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((person) => (
          <SelectItem key={person.id} value={String(person.id)}>
            {person.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

function formatDisplayDate(iso: string): string {
  try {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(date);
  } catch {
    return iso;
  }
}

/**
 * Create or edit an HBPR ↔ Albanian TL assignment with configurable cadence
 * and automatic date calculations.
 */
export const HbprAssignmentDialog: React.FC<HbprAssignmentDialogProps> = ({
  open,
  onOpenChange,
  mode = "create",
  editingAssignment,
  hbprOptions,
  albanianTlOptions,
  form,
  formErrors,
  onFieldChange,
  onSubmit,
  isSubmitting,
}) => {
  const hasExistingMeetings = Boolean(
    mode === "edit" &&
    (editingAssignment?.last_meeting_on || (editingAssignment?.evidence_count ?? 0) > 0)
  );

  // Auto-calculated upcoming meeting date based on current schedule
  const calculatedDate = useMemo(() => {
    const anchor =
      mode === "edit" && editingAssignment?.last_meeting_on
        ? editingAssignment.last_meeting_on
        : form.effective_from;
    if (!anchor) return "";
    return calculateNextCadenceOccurrence({
      cadence: form.cadence,
      cadenceDayOfWeek: form.cadence_day_of_week,
      cadenceNthWeek: form.cadence_nth_week,
      anchorDate: anchor,
    });
  }, [
    mode,
    editingAssignment?.last_meeting_on,
    form.cadence,
    form.cadence_day_of_week,
    form.cadence_nth_week,
    form.effective_from,
  ]);

  const selectedHbpr =
    hbprOptions.find((p) => p.id === form.hbpr)?.name ||
    editingAssignment?.hbpr_detail?.name ||
    "HBPR";
  const selectedTl =
    albanianTlOptions.find((p) => p.id === form.albanian_tl)?.name ||
    editingAssignment?.albanian_tl_detail?.name ||
    "Albanian TL";

  const handleApplyCalculatedDate = () => {
    if (calculatedDate) {
      onFieldChange("effective_from", calculatedDate);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "edit" ? "Edit HBPR assignment" : "New HBPR assignment"}
      description={
        mode === "edit"
          ? "Update the meeting cadence schedule or start date."
          : "Pairs one HR Business Partner with one Albanian team leader."
      }
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
    >
      <div className="space-y-4">
        {mode === "edit" ? (
          <div className="bg-muted/40 space-y-1 rounded-lg border p-3 text-sm">
            <p className="text-muted-foreground text-xs font-medium">Assignment pairing</p>
            <p className="font-semibold">
              {selectedHbpr} ↔ {selectedTl}
            </p>
          </div>
        ) : (
          <>
            <PersonSelect
              id="hbpr-assignment-hbpr"
              label="HR Business Partner"
              value={form.hbpr}
              options={hbprOptions}
              placeholder="Select an HBPR…"
              onChange={(id) => onFieldChange("hbpr", id)}
            />
            {formErrors.hbpr && <p className="text-tone-danger-text text-sm">{formErrors.hbpr}</p>}

            <PersonSelect
              id="hbpr-assignment-tl"
              label="Albanian team leader"
              value={form.albanian_tl}
              options={albanianTlOptions}
              placeholder="Select a team leader…"
              onChange={(id) => onFieldChange("albanian_tl", id)}
            />
            {formErrors.albanian_tl && (
              <p className="text-tone-danger-text text-sm">{formErrors.albanian_tl}</p>
            )}
          </>
        )}

        <CadenceScheduleFields
          idPrefix="hbpr-assignment"
          value={form}
          onFieldChange={(key, value) =>
            onFieldChange(key, value as HbprAssignmentForm[typeof key])
          }
        />

        {/* Live Calculated Date Callout */}
        {calculatedDate && (
          <div className="bg-surface-sunken flex items-center justify-between rounded-lg border p-2.5 text-xs">
            <div className="flex min-w-0 items-center gap-2">
              <CalendarDays className="text-primary h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="truncate">
                <span className="text-muted-foreground">Upcoming meeting: </span>
                <span className="text-foreground font-semibold">
                  {formatDisplayDate(calculatedDate)}
                </span>
                {hasExistingMeetings && editingAssignment?.last_meeting_on && (
                  <span className="text-muted-foreground ml-1.5 text-xs">
                    (projected from last meeting on {editingAssignment.last_meeting_on})
                  </span>
                )}
              </div>
            </div>
            {!hasExistingMeetings && calculatedDate !== form.effective_from && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-primary hover:text-primary h-7 gap-1 text-xs font-medium"
                onClick={handleApplyCalculatedDate}
              >
                <span>Set as start</span>
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Button>
            )}
          </div>
        )}

        <FormField
          id="hbpr-assignment-from"
          label="Effective from"
          value={form.effective_from}
          onChange={(value) => onFieldChange("effective_from", value)}
          error={formErrors.effective_from}
          helper={
            hasExistingMeetings && editingAssignment?.last_meeting_on
              ? `Historical meetings exist (last: ${editingAssignment.last_meeting_on}). Start date is anchored to history and cannot be set after this date.`
              : undefined
          }
          type="date"
          required
        />
        {formErrors.detail && <p className="text-tone-danger-text text-sm">{formErrors.detail}</p>}
      </div>
    </FormDialog>
  );
};
