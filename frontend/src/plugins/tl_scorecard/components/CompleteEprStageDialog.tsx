import React, { useState } from "react";
import { FileUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { FormDialog } from "@/components/ui/FormDialog";
import { InfoCallout } from "@/components/ui/InfoCallout";
import { Input } from "@/components/ui/input";
import { ModalSection } from "@/components/ui/ModalSection";
import { Textarea } from "@/components/ui/textarea";
import { extractApiErrorMessage } from "@/lib/apiFormError";
import type { EPRStage } from "../types/tlScorecard";

const MIN_GOALS = 5;
const MAX_GOALS = 50;
const MAX_TITLE_LENGTH = 255;

const STAGE_DESCRIPTION: Partial<Record<EPRStage, string>> = {
  goal_setting:
    "Import the Workday goal-setting PDF or enter the goal titles, then record the evidence.",
  mid_year:
    "Confirm the current goals or replace them from a new Workday PDF, then record the review evidence.",
};

const normalizeTitle = (title: string) => title.replace(/\s+/g, " ").trim();

const normalizeTitles = (titles: string[]) => titles.map(normalizeTitle).filter(Boolean);

const sameTitles = (left: string[], right: string[]) =>
  left.length === right.length && left.every((title, index) => title === right[index]);

interface CompleteEprStageValues {
  summary: string;
  reference_url: string;
  shared_with_employee: boolean;
  goal_titles?: string[];
}

interface CompleteEprStageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: EPRStage;
  /** Human-readable stage name shown in the title, e.g. "Mid-year". */
  stageLabel: string;
  /** 1-based position in the EPR sequence, shown as "Step N of M". */
  stepNumber?: number;
  stepCount?: number;
  initialGoalTitles?: string[];
  onParseGoals?: (file: File) => Promise<string[]>;
  onSave: (values: CompleteEprStageValues) => Promise<void>;
}

/**
 * The only way a stage's `*_completed_at` gets set: the backend `complete_stage`
 * action stamps it AND records this evidence atomically — a bare click is not
 * evidence. Goal Setting/Mid-year can confirm or replace Workday goal titles;
 * Final Review is read-only for goals. Uploaded PDFs are preview-only.
 */
export const CompleteEprStageDialog: React.FC<CompleteEprStageDialogProps> = ({
  open,
  onOpenChange,
  stage,
  stageLabel,
  stepNumber,
  stepCount,
  initialGoalTitles = [],
  onParseGoals,
  onSave,
}) => {
  const supportsGoals = stage !== "final_review";
  const [summary, setSummary] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [shared, setShared] = useState(false);
  const [goalTitles, setGoalTitles] = useState<string[]>(
    supportsGoals && initialGoalTitles.length === 0 ? [""] : initialGoalTitles
  );
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalizedGoalTitles = normalizeTitles(goalTitles);
  const initialTitles = normalizeTitles(initialGoalTitles);
  const goalsChanged = !sameTitles(normalizedGoalTitles, initialTitles);
  const goalsValid =
    !supportsGoals ||
    (normalizedGoalTitles.length >= MIN_GOALS &&
      normalizedGoalTitles.length <= MAX_GOALS &&
      new Set(normalizedGoalTitles.map((title) => title.toLowerCase())).size ===
        normalizedGoalTitles.length &&
      normalizedGoalTitles.every((title) => title.length <= MAX_TITLE_LENGTH));
  const canSubmit = Boolean(summary.trim()) && goalsValid && !isParsing && !isSubmitting;

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !onParseGoals) return;
    setIsParsing(true);
    setParseError(null);
    try {
      setGoalTitles(await onParseGoals(file));
    } catch (error) {
      setParseError(
        extractApiErrorMessage(error, "Could not parse the Workday PDF.").replace(
          /^(file|stage|goal_titles):\s*/i,
          ""
        )
      );
    } finally {
      setIsParsing(false);
    }
  };

  const updateGoal = (index: number, value: string) => {
    setParseError(null);
    setGoalTitles((current) =>
      current.map((title, titleIndex) => (titleIndex === index ? value : title))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const values: CompleteEprStageValues = {
        summary: summary.trim(),
        reference_url: referenceUrl.trim(),
        shared_with_employee: shared,
      };
      if (stage === "goal_setting" || (stage === "mid_year" && goalsChanged)) {
        values.goal_titles = normalizedGoalTitles;
      }
      await onSave(values);
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
      title={`Complete ${stageLabel}`}
      description={`${stepNumber && stepCount ? `Step ${stepNumber} of ${stepCount} · ` : ""}${
        STAGE_DESCRIPTION[stage] ??
        "Record the outcome of this stage — what was agreed, and where the review artifact lives."
      }`}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel="Complete stage"
      submitDisabled={!canSubmit}
      size="lg"
    >
      <div className="space-y-4">
        {supportsGoals && (
          <ModalSection
            columns={1}
            title="Confirmed Workday goals"
            description="Upload a Workday goal-setting PDF to preview titles, or edit the list manually. The PDF is parsed for this request only and is not stored."
          >
            <div className="space-y-2">
              <FieldLabel htmlFor="epr-goal-pdf">Workday PDF</FieldLabel>
              <Input
                id="epr-goal-pdf"
                type="file"
                accept="application/pdf,.pdf"
                disabled={isParsing || isSubmitting || !onParseGoals}
                onChange={handleFileChange}
              />
              <p className="text-muted-foreground text-xs">
                PDF only. Parsed titles are editable before confirmation.
              </p>
            </div>

            {isParsing && (
              <InfoCallout
                tone="info"
                icon={<FileUp className="h-4 w-4" />}
                label="Parsing Workday goals…"
              />
            )}
            {parseError && <InfoCallout tone="danger" label={parseError} />}

            <div className="space-y-3">
              {goalTitles.map((title, index) => (
                <div key={index} className="flex items-end gap-2">
                  <div className="min-w-0 flex-1 space-y-2">
                    <FieldLabel htmlFor={`epr-goal-${index}`}>Goal {index + 1}</FieldLabel>
                    <Input
                      id={`epr-goal-${index}`}
                      value={title}
                      onChange={(event) => updateGoal(index, event.target.value)}
                      maxLength={255}
                      disabled={isSubmitting}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11 min-w-11"
                    aria-label={`Remove Goal ${index + 1}`}
                    disabled={isSubmitting}
                    onClick={() => {
                      setParseError(null);
                      setGoalTitles((current) =>
                        current.filter((_, titleIndex) => titleIndex !== index)
                      );
                    }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSubmitting || goalTitles.length >= MAX_GOALS}
                onClick={() => {
                  setParseError(null);
                  setGoalTitles((current) => [...current, ""]);
                }}
              >
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Add goal
              </Button>
              <div
                className="bg-muted h-1.5 overflow-hidden rounded-full"
                role="progressbar"
                aria-label="Goals ready"
                aria-valuemin={0}
                aria-valuemax={MIN_GOALS}
                aria-valuenow={Math.min(normalizedGoalTitles.length, MIN_GOALS)}
              >
                <div
                  className="bg-primary h-full transition-[width] motion-reduce:transition-none"
                  style={{
                    width: `${(Math.min(normalizedGoalTitles.length, MIN_GOALS) / MIN_GOALS) * 100}%`,
                  }}
                />
              </div>
              <p
                className={`text-xs ${
                  normalizedGoalTitles.length >= MIN_GOALS
                    ? "text-tone-success-text"
                    : "text-tone-warning-text"
                }`}
                aria-live="polite"
              >
                {normalizedGoalTitles.length >= MIN_GOALS
                  ? `${normalizedGoalTitles.length} goals ready to confirm`
                  : `${normalizedGoalTitles.length}/${MIN_GOALS} goals ready`}
              </p>
            </div>
          </ModalSection>
        )}

        <ModalSection
          columns={1}
          title="Review evidence"
          description="Recorded with the stage. Optionally shared with the employee."
        >
          <div className="space-y-2">
            <FieldLabel htmlFor="epr-stage-summary" required>
              Summary
            </FieldLabel>
            <Textarea
              id="epr-stage-summary"
              rows={4}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="What was discussed and agreed at this stage."
            />
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="epr-stage-reference">Reference link</FieldLabel>
            <Input
              id="epr-stage-reference"
              type="url"
              value={referenceUrl}
              onChange={(e) => setReferenceUrl(e.target.value)}
              placeholder="https://… (e.g. the Workday review)"
            />
          </div>

          <label
            htmlFor="epr-stage-share"
            className="flex cursor-pointer items-start gap-2.5 text-sm"
          >
            <Checkbox
              id="epr-stage-share"
              className="mt-0.5"
              checked={shared}
              onCheckedChange={(checked) => setShared(checked === true)}
            />
            <span>
              Share with employee
              <span className="text-muted-foreground block text-xs">
                The summary appears on their My Records page.
              </span>
            </span>
          </label>
        </ModalSection>
      </div>
    </FormDialog>
  );
};
