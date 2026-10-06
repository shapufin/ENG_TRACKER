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
      <div className="mt-2 flex flex-wrap gap-1.5">
        {STAGES.map(({ field, label }) => {
          const fieldKey = `${field}_completed_at` as const;
          const completedAt = cycle[fieldKey];
          const disabled = Boolean(completedAt);
          return (
            <Button
              key={field}
              size="sm"
              variant={completedAt ? "secondary" : "outline"}
              disabled={disabled}
              onClick={() => setCompleting(field)}
            >
              {completedAt && <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
              {label}
            </Button>
          );
        })}
      </div>
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
