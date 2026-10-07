import React, { useState } from "react";
import { CheckCircle2, ClipboardCheck, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassCard } from "@/components/ui/GlassCard";
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

const CycleRow: React.FC<{
  cycle: EPRCycle;
  onParseGoals: (cycleId: number, stage: EPRStage, file: File) => Promise<string[]>;
  onCompleteStage: (cycleId: number, data: CompleteEprStagePayload) => Promise<void>;
}> = ({ cycle, onParseGoals, onCompleteStage }) => {
  const [completing, setCompleting] = useState<EPRStage | null>(null);
  const completedAt = (field: EPRStage) => cycle[`${field}_completed_at` as const];
  // Stages complete in order — the backend rejects a later stage while an
  // earlier one is open, so don't offer a button that can only 400.
  const firstOpenIndex = STAGES.findIndex((stage) => !completedAt(stage.field));

  return (
    <li className="py-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          {cycle.user_name} · {cycle.year}
        </p>
        <p
          className={`text-xs ${cycle.goal_count >= 5 ? toneTextClass.success : toneTextClass.warning}`}
        >
          {cycle.goal_count}/5 confirmed goals
        </p>
      </div>
      <ol className="mt-3 grid gap-2 sm:grid-cols-3" aria-label="EPR progress">
        {STAGES.map(({ field, label }, index) => {
          const stageCompletedAt = completedAt(field);
          const isCurrent = index === firstOpenIndex;
          const earlierOpen = STAGES.slice(0, index).some((earlier) => !completedAt(earlier.field));
          const laterDone = STAGES.slice(index + 1).some((later) => completedAt(later.field));
          // Opened out of order before the sequence was enforced: the backend
          // locks goals once a later stage is done, so the step can't proceed.
          const stranded = !stageCompletedAt && laterDone;
          const disabled = Boolean(stageCompletedAt) || earlierOpen || stranded;
          const status = stageCompletedAt
            ? `Completed ${new Date(stageCompletedAt).toLocaleDateString()}`
            : stranded
              ? "Blocked — a later step is already complete"
              : earlierOpen
                ? "Locked until the previous step is done"
                : "Ready to complete";
          return (
            <li
              key={field}
              aria-current={isCurrent ? "step" : undefined}
              className={`flex flex-col gap-2 rounded-lg border p-3 ${
                isCurrent && !stranded
                  ? "border-primary bg-tone-info-surface"
                  : "border-line-subtle"
              }`}
            >
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={`text-micro flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-semibold ${
                    stageCompletedAt
                      ? "bg-tone-success-surface text-tone-success-text border-transparent"
                      : "text-muted-foreground"
                  }`}
                  aria-hidden="true"
                >
                  {stageCompletedAt ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span className="text-muted-foreground font-medium">
                  Step {index + 1}
                  {isCurrent && !stranded ? " · Current" : ""}
                </span>
              </div>
              <Button
                size="sm"
                variant={
                  stageCompletedAt ? "secondary" : isCurrent && !stranded ? "default" : "outline"
                }
                disabled={disabled}
                onClick={() => setCompleting(field)}
                aria-describedby={`epr-${cycle.id}-${field}-status`}
              >
                {label}
              </Button>
              <p
                id={`epr-${cycle.id}-${field}-status`}
                className={`text-xs ${stranded ? toneTextClass.warning : "text-muted-foreground"}`}
              >
                {status}
              </p>
            </li>
          );
        })}
      </ol>
      {cycle.stage_records && cycle.stage_records.length > 0 && (
        <ul className="mt-2 space-y-2">
          {cycle.stage_records.map((record) => (
            <StageRecordRow key={record.id} record={record} />
          ))}
        </ul>
      )}
      {completing && (
        <CompleteEprStageDialog
          key={completing}
          open
          onOpenChange={(open) => !open && setCompleting(null)}
          stage={completing}
          stageLabel={stageLabel(completing)}
          stepNumber={STAGES.findIndex((stage) => stage.field === completing) + 1}
          stepCount={STAGES.length}
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

export const EPRSection: React.FC<EPRSectionProps> = ({
  cycles,
  onParseGoals,
  onCompleteStage,
}) => (
  <GlassCard animateOnMount={false} isHoverLift={false} className="p-4">
    <h2 className="text-sm font-semibold">EPR cycles</h2>
    {cycles.length === 0 ? (
      <EmptyState icon={ClipboardCheck} title="No EPR cycles started" className="py-6" />
    ) : (
      <ul className="divide-border/50 divide-y">
        {cycles.map((cycle) => (
          <CycleRow
            key={cycle.id}
            cycle={cycle}
            onParseGoals={onParseGoals}
            onCompleteStage={onCompleteStage}
          />
        ))}
      </ul>
    )}
  </GlassCard>
);
