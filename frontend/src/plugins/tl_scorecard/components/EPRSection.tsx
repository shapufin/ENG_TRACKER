import React, { useState } from "react";
import { CheckCircle2, ClipboardCheck, ExternalLink } from "lucide-react";
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
  onAddGoal: (cycleId: number, description: string) => Promise<void>;
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
  onAddGoal: (cycleId: number, description: string) => Promise<void>;
  onCompleteStage: (cycleId: number, data: CompleteEprStagePayload) => Promise<void>;
}> = ({ cycle, onAddGoal, onCompleteStage }) => {
  const [goalText, setGoalText] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [completing, setCompleting] = useState<EPRStage | null>(null);

  const handleAddGoal = async () => {
    if (!goalText.trim()) return;
    setIsAdding(true);
    try {
      await onAddGoal(cycle.id, goalText.trim());
      setGoalText("");
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <li className="py-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          {cycle.user_name} · {cycle.year}
        </p>
        <p
          className={`text-xs ${cycle.goal_count >= 5 ? toneTextClass.success : toneTextClass.warning}`}
        >
          {cycle.goal_count}/5 goals
        </p>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {STAGES.map(({ field, label }) => {
          const fieldKey = `${field}_completed_at` as const;
          const completedAt = cycle[fieldKey];
          const disabled =
            Boolean(completedAt) || (field === "goal_setting" && cycle.goal_count < 5);
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
      <div className="mt-2 flex gap-2">
        <Input
          value={goalText}
          onChange={(e) => setGoalText(e.target.value)}
          placeholder="Add a goal..."
          className="h-8 text-xs"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={isAdding || !goalText.trim()}
          onClick={handleAddGoal}
        >
          Add
        </Button>
      </div>
      {completing && (
        <CompleteEprStageDialog
          open
          onOpenChange={(open) => !open && setCompleting(null)}
          stageLabel={stageLabel(completing)}
          onSave={async (values) => {
            await onCompleteStage(cycle.id, { stage: completing, ...values });
          }}
        />
      )}
    </li>
  );
};

export const EPRSection: React.FC<EPRSectionProps> = ({ cycles, onAddGoal, onCompleteStage }) => (
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
            onAddGoal={onAddGoal}
            onCompleteStage={onCompleteStage}
          />
        ))}
      </ul>
    )}
  </GlassCard>
);
