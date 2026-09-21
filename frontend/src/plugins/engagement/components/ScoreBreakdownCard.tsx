import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import type { EngagementTeamBreakdownRow } from "../types/engagement";

interface ScoreBreakdownCardProps {
  rows: EngagementTeamBreakdownRow[];
}

const COMPONENTS: Array<{
  key: "score_speed" | "score_approval_rate" | "score_activity" | "score_consistency";
  label: string;
}> = [
  { key: "score_speed", label: "Speed" },
  { key: "score_approval_rate", label: "Approval rate" },
  { key: "score_activity", label: "Activity" },
  { key: "score_consistency", label: "Consistency" },
];

const barClass = (v: number | null) => {
  if (v === null) return "bg-muted";
  if (v >= 80) return "bg-[hsl(var(--tone-success-text))]";
  if (v >= 50) return "bg-[hsl(var(--tone-warning-text))]";
  return "bg-[hsl(var(--tone-danger-text))]";
};

/** Mean of per-team sub-scores already fetched in team-breakdown. No new endpoint. */
export const ScoreBreakdownCard: React.FC<ScoreBreakdownCardProps> = ({ rows }) => {
  const means = COMPONENTS.map(({ key, label }) => {
    const vals = rows.map((r) => r[key]).filter((v): v is number => v !== null);
    return {
      label,
      value: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null,
    };
  });

  return (
    <GlassCard className="p-5">
      <h3 className="text-sm font-semibold tracking-tight">Score breakdown</h3>
      <p className="mt-1 text-xs text-muted-foreground">What drives the composite score</p>
      <dl className="mt-4 space-y-3">
        {means.map(({ label, value }) => (
          <div key={label}>
            <div className="flex items-center justify-between text-xs">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-mono font-bold tabular-nums">{value !== null ? value : "—"}</dd>
            </div>
            <div
              className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-input-bg"
              role="progressbar"
              aria-label={`${label} score`}
              aria-valuenow={value ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={`h-full rounded-full ${barClass(value)}`}
                style={{ width: `${value ?? 0}%` }}
              />
            </div>
          </div>
        ))}
      </dl>
    </GlassCard>
  );
};
