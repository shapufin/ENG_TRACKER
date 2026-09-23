import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import type { EngagementSummary } from "../types/engagement";

interface ScoreBreakdownCardProps {
  summary: EngagementSummary;
}

const COMPONENTS: Array<{
  key: "score_speed" | "score_approval_rate" | "score_activity" | "score_consistency";
  label: string;
  badge: (value: number | null) => string;
}> = [
  {
    key: "score_speed",
    label: "Speed",
    badge: (v) => (v === null ? "No data" : v >= 90 ? "Instant SLA" : v >= 50 ? "Keeping pace" : "Slow to decide"),
  },
  {
    key: "score_approval_rate",
    label: "Approval rate",
    badge: (v) => (v === null ? "No data" : v >= 90 ? "Nearly all accepted" : v >= 50 ? "Mixed outcomes" : "High rejection"),
  },
  {
    key: "score_activity",
    label: "Activity",
    badge: (v) => (v === null ? "No data" : v >= 90 ? "Fully active" : v >= 50 ? "Partially active" : "Mostly quiet"),
  },
  {
    key: "score_consistency",
    label: "Consistency",
    badge: (v) => (v === null ? "No data" : v >= 70 ? "Steady pace" : v >= 30 ? "Some variance" : "Needs regular logging"),
  },
];

const barClass = (v: number | null) => {
  if (v === null) return "bg-muted";
  if (v >= 80) return "bg-[hsl(var(--tone-success-text))]";
  if (v >= 50) return "bg-[hsl(var(--tone-warning-text))]";
  return "bg-[hsl(var(--tone-danger-text))]";
};

/** Sourced from the `summary` endpoint's team-size-weighted sub-scores — the
 * same composite math that produces `engagement_score`, so this breakdown
 * always adds up to the headline number instead of a separate per-row mean. */
export const ScoreBreakdownCard: React.FC<ScoreBreakdownCardProps> = ({ summary }) => (
  <GlassCard className="p-5">
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-semibold tracking-tight">Score breakdown</h3>
      <span className="font-mono text-xs font-bold text-primary">
        Composite: {summary.engagement_score !== null ? summary.engagement_score.toFixed(0) : "—"} / 100
      </span>
    </div>
    <p className="mt-1 text-xs text-muted-foreground">What drives the composite score</p>
    <dl className="mt-4 space-y-3">
      {COMPONENTS.map(({ key, label, badge }) => {
        const value = summary[key];
        return (
          <div key={label}>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <dt className="text-muted-foreground">{label}</dt>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {badge(value)}
                </span>
              </div>
              <dd className="font-mono font-bold tabular-nums">{value !== null ? Math.round(value) : "—"}</dd>
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
        );
      })}
    </dl>
  </GlassCard>
);
