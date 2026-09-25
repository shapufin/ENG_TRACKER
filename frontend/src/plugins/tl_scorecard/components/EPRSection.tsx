import React, { useState } from "react";
import { CheckCircle2, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input } from "@/components/ui/input";
import { toneTextClass } from "@/components/ui/tone";
import type { EPRCycle, EPRStage } from "../types/tlScorecard";

const STAGES: { field: EPRStage; label: string }[] = [
  { field: "goal_setting", label: "Goal Setting" },
  { field: "mid_year", label: "Mid-year" },
  { field: "final_review", label: "Final Review" },
];

interface EPRSectionProps {
  cycles: EPRCycle[];
  onAddGoal: (cycleId: number, description: string) => Promise<void>;
  onCompleteStage: (cycleId: number, stage: EPRStage) => Promise<void>;
}

const CycleRow: React.FC<{
  cycle: EPRCycle;
  onAddGoal: (cycleId: number, description: string) => Promise<void>;
  onCompleteStage: (cycleId: number, stage: EPRStage) => Promise<void>;
}> = ({ cycle, onAddGoal, onCompleteStage }) => {
  const [goalText, setGoalText] = useState("");
  const [isAdding, setIsAdding] = useState(false);

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
        <p className="text-sm font-medium">{cycle.user_name} · {cycle.year}</p>
        <p className={`text-xs ${cycle.goal_count >= 5 ? toneTextClass.success : toneTextClass.warning}`}>
          {cycle.goal_count}/5 goals
        </p>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {STAGES.map(({ field, label }) => {
          const fieldKey = `${field}_completed_at` as const;
          const completedAt = cycle[fieldKey];
          const disabled = Boolean(completedAt) || (field === "goal_setting" && cycle.goal_count < 5);
          return (
            <Button
              key={field}
              size="sm"
              variant={completedAt ? "secondary" : "outline"}
              disabled={disabled}
              onClick={() => onCompleteStage(cycle.id, field)}
            >
              {completedAt && <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
              {label}
            </Button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          value={goalText}
          onChange={(e) => setGoalText(e.target.value)}
          placeholder="Add a goal..."
          className="h-8 text-xs"
        />
        <Button size="sm" variant="outline" disabled={isAdding || !goalText.trim()} onClick={handleAddGoal}>
          Add
        </Button>
      </div>
    </li>
  );
};

export const EPRSection: React.FC<EPRSectionProps> = ({ cycles, onAddGoal, onCompleteStage }) => (
  <GlassCard animateOnMount={false} isHoverLift={false} className="p-4">
    <h2 className="text-sm font-semibold">EPR cycles</h2>
    {cycles.length === 0 ? (
      <EmptyState icon={ClipboardCheck} title="No EPR cycles started" className="py-6" />
    ) : (
      <ul className="divide-y divide-border/50">
        {cycles.map((cycle) => (
          <CycleRow key={cycle.id} cycle={cycle} onAddGoal={onAddGoal} onCompleteStage={onCompleteStage} />
        ))}
      </ul>
    )}
  </GlassCard>
);
