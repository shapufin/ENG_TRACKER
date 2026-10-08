import React from "react";
import { Gauge, Users, UserCheck, CheckCircle2, RotateCcw, HeartHandshake } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { toneTextClass } from "@/components/ui/tone";
import type { EngagementSummary } from "../types/engagement";

interface SummaryCardsProps {
  summary: EngagementSummary;
  /** Score change vs the previous trend point, in points. Null when not enough history. */
  scoreDelta?: number | null;
}

const scoreTone = (score: number | null) => {
  if (score === null) return undefined;
  if (score >= 80) return toneTextClass.success;
  if (score >= 50) return toneTextClass.warning;
  return toneTextClass.danger;
};

export const SummaryCards: React.FC<SummaryCardsProps> = ({ summary, scoreDelta }) => (
  <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
    <StatCard
      label="Engagement Score"
      value={summary.engagement_score !== null ? summary.engagement_score.toFixed(0) : "—"}
      icon={Gauge}
      valueColorClass={scoreTone(summary.engagement_score)}
      statusDotLabel={summary.is_stale ? "Data is stale" : undefined}
      statusDotClassName={summary.is_stale ? "bg-[hsl(var(--tone-warning-text))]" : undefined}
      trend={
        scoreDelta !== null && scoreDelta !== undefined
          ? `${scoreDelta >= 0 ? "+" : ""}${scoreDelta} pts vs last month`
          : summary.is_stale
            ? "Stale — recomputed monthly"
            : `${summary.team_count} team(s)`
      }
      progressPercent={summary.engagement_score ?? undefined}
    />
    <StatCard label="Team Size" value={summary.team_size} icon={Users} />
    <StatCard
      label="Active Submitters"
      value={summary.active_submitters}
      icon={UserCheck}
      trend={
        summary.team_size
          ? `${Math.round((summary.active_submitters / summary.team_size) * 100)}% of team`
          : undefined
      }
    />
    <StatCard
      label="Approval Rate"
      value={summary.approval_rate_pct !== null ? `${summary.approval_rate_pct.toFixed(0)}%` : "—"}
      icon={CheckCircle2}
      trend={
        summary.avg_tta_hours !== null ? `${summary.avg_tta_hours.toFixed(2)}h avg` : undefined
      }
    />
    {summary.decisions_during_leave > 0 ? (
      <StatCard
        label="Dedication"
        value={summary.decisions_during_leave}
        icon={HeartHandshake}
        valueColorClass={toneTextClass.success}
        trend="Decisions made while on leave"
      />
    ) : (
      <StatCard label="Resubmissions" value={summary.resubmission_count} icon={RotateCcw} />
    )}
  </div>
);
