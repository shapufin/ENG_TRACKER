import React from "react";

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
import { CADENCE_LABELS } from "@/types/hbprAssignment";
import type { HbprCadence, HbprPersonRef } from "@/types/hbprAssignment";

export interface HbprAssignmentForm {
  hbpr: number | null;
  albanian_tl: number | null;
  cadence: HbprCadence;
  effective_from: string;
}

interface HbprAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

/**
 * Create an HBPR ↔ Albanian TL assignment. Identity and range are immutable
 * once created (the API rejects PATCH on them), so this is create-only; use
 * End on the page for later changes.
 */
export const HbprAssignmentDialog: React.FC<HbprAssignmentDialogProps> = ({
  open,
  onOpenChange,
  hbprOptions,
  albanianTlOptions,
  form,
  formErrors,
  onFieldChange,
  onSubmit,
  isSubmitting,
}) => (
  <FormDialog
    open={open}
    onOpenChange={onOpenChange}
    title="New HBPR assignment"
    description="Pairs one HR Business Partner with one Albanian team leader."
    onSubmit={onSubmit}
    isSubmitting={isSubmitting}
  >
    <div className="space-y-4">
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

      <div className="space-y-2">
        <Label htmlFor="hbpr-assignment-cadence">Meeting cadence</Label>
        <Select
          value={form.cadence}
          onValueChange={(v) => onFieldChange("cadence", v as HbprCadence)}
        >
          <SelectTrigger
            id="hbpr-assignment-cadence"
            aria-label="Meeting cadence"
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(CADENCE_LABELS) as HbprCadence[]).map((cadence) => (
              <SelectItem key={cadence} value={cadence}>
                {CADENCE_LABELS[cadence]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <FormField
        id="hbpr-assignment-from"
        label="Effective from"
        value={form.effective_from}
        onChange={(value) => onFieldChange("effective_from", value)}
        error={formErrors.effective_from}
        type="date"
        required
      />
    </div>
  </FormDialog>
);
