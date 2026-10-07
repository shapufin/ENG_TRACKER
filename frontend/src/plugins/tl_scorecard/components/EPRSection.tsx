import React, { useState } from "react";
import { ChevronRight, ClipboardCheck, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input } from "@/components/ui/input";
import { toneTextClass } from "@/components/ui/tone";
import { CompleteEprStageDialog } from "./CompleteEprStageDialog";
import type {
  CompleteEprStagePayload,
  EPRCycle,
  EPRStage,
  EPRStageRecord,
  EPRStageRecordMeta,
} from "../types/tlScorecard";

const STAGES: { field: EPRStage; label: string }[] = [
  { field: "goal_setting", label: "Goal Setting" },
  { field: "mid_year", label: "Mid-year" },
  { field: "final_review", label: "Final Review" },
];

const stageLabel = (stage: EPRStage) => STAGES.find((s) => s.field === stage)?.label ?? stage;

interface EPRSectionProps {
  cycles: EPRCycle[];
  onParseGoals: (cycleId: number, stage: EPRStage, file: File) => Promise<string[]>;
  onCompleteStage: (cycleId: number, data: CompleteEprStagePayload) => Promise<void>;
}

const StageRecordRow: React.FC<{ record: EPRStageRecord | EPRStageRecordMeta }> = ({ record }) => {
  // Full row for the owning TL/staff; metadata-only for an HBPR — the API
  // decides which shape it sends, the UI just renders what arrived.
  const full = "summary" in record;
  const referenceUrl = full ? record.reference_url : "";
  const hasReference = full ? Boolean(referenceUrl) : record.has_reference;
  return (
    <li className="border-line-subtle rounded-lg border p-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium">{stageLabel(record.stage)}</span>
        {record.shared_with_employee && <Badge variant="info">Shared with employee</Badge>}
        {record.recorded_by_name && (
          <span className="text-muted-foreground">by {record.recorded_by_name}</span>
        )}
      </div>
      {full && record.summary && (
        <p className="mt-1 break-words whitespace-pre-line">{record.summary}</p>
      )}
      {hasReference &&
        (referenceUrl ? (
          <a
            href={referenceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary mt-1 inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            Reference
          </a>
        ) : (
          <span className="text-muted-foreground mt-1 block">Reference on file</span>
        ))}
    </li>
  );
};

const STAGE_HINT: Record<EPRStage, string> = {
  goal_setting: "Agree the goals for the year with the employee, then confirm them here.",
  mid_year: "Check progress. Keep the goals as they are, or replace them.",
  final_review: "Close the year with a review summary. Goals stay as they are.",
};

const SHORT_LABEL: Record<EPRStage, string> = {
  goal_setting: "Goals",
  mid_year: "Mid-year",
  final_review: "Final",
};

type StepState = "done" | "current" | "locked" | "blocked" | "evidence-only";

interface StepInfo {
  field: EPRStage;
  label: string;
  completedAt: string | null | undefined;
  state: StepState;
  status: string;
}

/** One pass over a cycle: the state of each step and the phase to show at a glance. */
const describeCycle = (cycle: EPRCycle) => {
  const completedAt = (field: EPRStage) => cycle[`${field}_completed_at` as const];
  const firstOpenIndex = STAGES.findIndex((stage) => !completedAt(stage.field));
  const steps: StepInfo[] = STAGES.map(({ field, label }, index) => {
    const done = completedAt(field);
    const earlierOpen = STAGES.slice(0, index).some((earlier) => !completedAt(earlier.field));
    const laterDone = STAGES.slice(index + 1).some((later) => completedAt(later.field));
    // Completed out of order before the sequence was enforced: the backend
    // locks goals once a later stage is done, so only evidence remains.
    const stranded = !done && laterDone;
    let state: StepState = "locked";
    let status = "Locked until the previous step is done";
    if (done) {
      state = "done";
      status = `Completed ${new Date(done).toLocaleDateString()}`;
    } else if (stranded && cycle.goal_count >= 5) {
      state = "evidence-only";
      status = "Out of order — record evidence only; goals are locked";
    } else if (stranded) {
      state = "blocked";
      status = "Blocked — a later step is already complete";
    } else if (!earlierOpen) {
      state = "current";
      status = "Ready to complete";
    }
    return { field, label, completedAt: done, state, status };
  });
  const open = firstOpenIndex === -1 ? null : steps[firstOpenIndex];
  const attention = steps.some(
    (step) => step.state === "blocked" || step.state === "evidence-only"
  );
  return { steps, open, firstOpenIndex, attention };
};

type PhaseFilter = "all" | EPRStage | "complete" | "attention";

const phaseOf = (cycle: EPRCycle): PhaseFilter => {
  const { open, attention } = describeCycle(cycle);
  if (attention) return "attention";
  return open ? open.field : "complete";
};

const SEGMENT_CLASS: Record<StepState, string> = {
  done: "bg-tone-success-text",
  current: "bg-primary",
  locked: "bg-border",
  blocked: "bg-tone-warning-text",
  "evidence-only": "bg-tone-warning-text",
};

const CycleRow: React.FC<{
  cycle: EPRCycle;
  onParseGoals: (cycleId: number, stage: EPRStage, file: File) => Promise<string[]>;
  onCompleteStage: (cycleId: number, data: CompleteEprStagePayload) => Promise<void>;
}> = ({ cycle, onParseGoals, onCompleteStage }) => {
  const [completing, setCompleting] = useState<EPRStage | null>(null);
  const [expanded, setExpanded] = useState(false);
  const { steps, open, attention } = describeCycle(cycle);
  const completedAt = (field: EPRStage) => cycle[`${field}_completed_at` as const];
  const recordsFor = (field: EPRStage) =>
    (cycle.stage_records ?? []).filter((record) => record.stage === field);
  // The one step the TL can act on now; completed and locked steps have none.
  const actionable = steps.find(
    (step) => step.state === "current" || step.state === "evidence-only"
  );
  const phaseBadge = !open ? (
    <Badge variant="success">Complete</Badge>
  ) : attention ? (
    <Badge variant="warning">Needs attention</Badge>
  ) : (
    <Badge variant="info">{open.label}</Badge>
  );
  const detailsId = `epr-${cycle.id}-details`;

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 basis-56 items-start gap-2 text-left"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronRight
            className={`text-muted-foreground mt-0.5 h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none ${
              expanded ? "rotate-90" : ""
            }`}
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              {cycle.user_name} · {cycle.year}
            </span>
            <span
              className={`block text-xs ${
                cycle.goal_count >= 5 ? toneTextClass.success : toneTextClass.warning
              }`}
            >
              {cycle.goal_count}/5 confirmed goals
            </span>
          </span>
        </button>

        <ol className="flex w-48 shrink-0 gap-1" aria-label="EPR progress">
          {steps.map((step) => (
            <li
              key={step.field}
              className="min-w-0 flex-1"
              aria-current={step === actionable ? "step" : undefined}
              title={`${step.label}: ${step.status}`}
            >
              <span className={`block h-1.5 rounded-full ${SEGMENT_CLASS[step.state]}`} />
              <span className="text-muted-foreground text-micro mt-0.5 block truncate">
                {SHORT_LABEL[step.field]}
                <span className="sr-only"> — {step.status}</span>
              </span>
            </li>
          ))}
        </ol>

        <div className="flex items-center gap-2">
          {phaseBadge}
          {actionable && (
            <Button
              size="sm"
              variant={actionable.state === "current" ? "default" : "outline"}
              onClick={() => setCompleting(actionable.field)}
              aria-label={`Complete ${actionable.label}`}
            >
              Complete step
            </Button>
          )}
        </div>
      </div>

      {expanded && (
        <ol id={detailsId} className="mt-3 ml-6 space-y-3 border-l pl-4">
          {steps.map((step, index) => {
            const records = recordsFor(step.field);
            return (
              <li key={step.field} className="space-y-1.5">
                <p className="text-sm font-medium">
                  {index + 1}. {step.label}
                </p>
                <p
                  className={`text-xs ${
                    step.state === "blocked" || step.state === "evidence-only"
                      ? toneTextClass.warning
                      : "text-muted-foreground"
                  }`}
                >
                  {step.status}
                </p>
                {step.state === "current" && (
                  <p className="text-muted-foreground text-xs">{STAGE_HINT[step.field]}</p>
                )}
                {step.field === "goal_setting" && cycle.goals.length > 0 && (
                  <details className="text-xs">
                    <summary className="text-primary cursor-pointer font-medium">
                      {cycle.goals.length} confirmed goals
                    </summary>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {cycle.goals.map((goal) => (
                        <li key={goal.id} className="break-words">
                          {goal.description}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {records.length > 0 && (
                  <ul className="space-y-2">
                    {records.map((record) => (
                      <StageRecordRow key={record.id} record={record} />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {completing && (
        <CompleteEprStageDialog
          key={completing}
          open
          onOpenChange={(isOpen) => !isOpen && setCompleting(null)}
          stage={completing}
          stageLabel={stageLabel(completing)}
          stepNumber={STAGES.findIndex((stage) => stage.field === completing) + 1}
          stepCount={STAGES.length}
          goalsLocked={
            completing !== "final_review" &&
            STAGES.slice(STAGES.findIndex((stage) => stage.field === completing) + 1).some(
              (later) => completedAt(later.field)
            )
          }
          initialGoalTitles={cycle.goals.map((goal) => goal.description)}
          onParseGoals={(file) => onParseGoals(cycle.id, completing, file)}
          onSave={async (values) => {
            await onCompleteStage(cycle.id, { stage: completing, ...values });
          }}
        />
      )}
    </li>
  );
};

const PAGE_SIZE = 10;

const FILTERS: { value: PhaseFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "attention", label: "Needs attention" },
  { value: "goal_setting", label: "Goal Setting" },
  { value: "mid_year", label: "Mid-year" },
  { value: "final_review", label: "Final Review" },
  { value: "complete", label: "Complete" },
];

export const EPRSection: React.FC<EPRSectionProps> = ({
  cycles,
  onParseGoals,
  onCompleteStage,
}) => {
  const [filter, setFilter] = useState<PhaseFilter>("all");
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const phases = cycles.map((cycle) => ({ cycle, phase: phaseOf(cycle) }));
  const counts = (value: PhaseFilter) =>
    value === "all" ? phases.length : phases.filter((item) => item.phase === value).length;
  const needle = query.trim().toLowerCase();
  const matching = phases
    .filter((item) => filter === "all" || item.phase === filter)
    .filter((item) => !needle || (item.cycle.user_name ?? "").toLowerCase().includes(needle))
    // Needs-attention first so a long list never buries a stuck cycle.
    .sort((a, b) => Number(b.phase === "attention") - Number(a.phase === "attention"));
  const shown = matching.slice(0, visible);

  return (
    <GlassCard animateOnMount={false} isHoverLift={false} className="p-4">
      <h2 className="text-sm font-semibold">EPR cycles</h2>
      {cycles.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No EPR cycles started" className="py-6" />
      ) : (
        <>
          {cycles.length > 3 && (
            <div className="mt-3 space-y-2">
              <Input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setVisible(PAGE_SIZE);
                }}
                placeholder="Search by name"
                aria-label="Search EPR cycles by name"
              />
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by phase">
                {FILTERS.filter(
                  (item) => item.value === "all" || counts(item.value) > 0 || item.value === filter
                ).map((item) => (
                  <Button
                    key={item.value}
                    type="button"
                    size="sm"
                    variant={filter === item.value ? "default" : "outline"}
                    aria-pressed={filter === item.value}
                    onClick={() => {
                      setFilter(item.value);
                      setVisible(PAGE_SIZE);
                    }}
                  >
                    {item.label} {counts(item.value)}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {shown.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              No cycles match this filter.
            </p>
          ) : (
            <ul className="divide-border/50 divide-y">
              {shown.map(({ cycle }) => (
                <CycleRow
                  key={cycle.id}
                  cycle={cycle}
                  onParseGoals={onParseGoals}
                  onCompleteStage={onCompleteStage}
                />
              ))}
            </ul>
          )}
          {matching.length > shown.length && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 w-full"
              onClick={() => setVisible((value) => value + PAGE_SIZE)}
            >
              Show {Math.min(PAGE_SIZE, matching.length - shown.length)} more (
              {matching.length - shown.length} hidden)
            </Button>
          )}
        </>
      )}
    </GlassCard>
  );
};
