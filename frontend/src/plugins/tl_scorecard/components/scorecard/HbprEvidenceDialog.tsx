import React, { useState } from "react";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { FormDialog } from "@/components/ui/FormDialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { HbprEvidence, HbprEvidenceKind, HbprEvidencePayload } from "../../types/tlScorecard";
import { EVIDENCE_KIND_LABELS } from "../hbpr/hbprMeta";

const KINDS: HbprEvidenceKind[] = ["cadence_meeting", "epr_mid_year", "epr_year_end"];
const EPR_KINDS: HbprEvidenceKind[] = ["epr_mid_year", "epr_year_end"];

const todayIso = () => new Date().toISOString().slice(0, 10);

interface HbprEvidenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The assignment the evidence belongs to (the AL TL's open partnership). */
  assignmentId: number;
  onSave: (data: HbprEvidencePayload) => Promise<void>;
  mode?: "create" | "edit";
  initial?: HbprEvidence;
  defaultYear?: number;
}

/**
 * Records the AL TL's governance evidence: a recurring cadence meeting, or their
 * participation in the mid-year / year-end EPR. Only the assigned AL TL (and
 * staff) may author it — the HBPR participates but is read-only.
 */
export const HbprEvidenceDialog: React.FC<HbprEvidenceDialogProps> = ({
  open,
  onOpenChange,
  assignmentId,
  onSave,
  mode = "create",
  initial,
  defaultYear,
}) => {
  const isEdit = mode === "edit";
  const [kind, setKind] = useState<HbprEvidenceKind>(initial?.kind ?? "cadence_meeting");
  const [occurredOn, setOccurredOn] = useState(initial?.occurred_on ?? todayIso());
  const [year, setYear] = useState(
    String(initial?.reporting_year ?? defaultYear ?? new Date().getFullYear())
  );
  const [summary, setSummary] = useState(initial?.shared_summary ?? "");
  const [actionItems, setActionItems] = useState(initial?.action_items ?? "");
  const [referenceUrl, setReferenceUrl] = useState(initial?.reference_url ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const needsYear = EPR_KINDS.includes(kind);
  const yearValue = Number(year);
  const yearValid =
    !needsYear || (Number.isInteger(yearValue) && yearValue >= 2000 && yearValue <= 2100);
  const canSubmit = Boolean(occurredOn) && yearValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await onSave({
        assignment: assignmentId,
        kind,
        occurred_on: occurredOn,
        reporting_year: needsYear ? yearValue : null,
        shared_summary: summary.trim(),
        action_items: actionItems.trim(),
        reference_url: referenceUrl.trim(),
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
      title={isEdit ? "Edit log entry" : "Add log entry"}
      description="The assigned Albanian team leader authors this; the HBPR and staff can read it."
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel={isEdit ? "Save changes" : "Save entry"}
      submitDisabled={!canSubmit}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <FieldLabel htmlFor="hbpr-evidence-kind" required>
            Evidence type
          </FieldLabel>
          <Select value={kind} onValueChange={(v) => setKind(v as HbprEvidenceKind)}>
            <SelectTrigger id="hbpr-evidence-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {EVIDENCE_KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <FieldLabel htmlFor="hbpr-evidence-date" required>
              {needsYear ? "Participation date" : "Meeting date"}
            </FieldLabel>
            <Input
              id="hbpr-evidence-date"
              type="date"
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
            />
          </div>
          {needsYear && (
            <div className="space-y-2">
              <FieldLabel htmlFor="hbpr-evidence-year" required>
                Reporting year
              </FieldLabel>
              <Input
                id="hbpr-evidence-year"
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
              {!yearValid && (
                <p role="alert" className="text-tone-danger-text mt-1 text-xs">
                  Enter a year between 2000 and 2100.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="hbpr-evidence-summary">Summary</FieldLabel>
          <Textarea
            id="hbpr-evidence-summary"
            rows={4}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="What was discussed and agreed."
          />
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="hbpr-evidence-actions">Action items</FieldLabel>
          <Textarea
            id="hbpr-evidence-actions"
            rows={3}
            value={actionItems}
            onChange={(e) => setActionItems(e.target.value)}
            placeholder="Follow-ups with an owner."
          />
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="hbpr-evidence-reference">Reference link</FieldLabel>
          <Input
            id="hbpr-evidence-reference"
            type="url"
            value={referenceUrl}
            onChange={(e) => setReferenceUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>
      </div>
    </FormDialog>
  );
};
