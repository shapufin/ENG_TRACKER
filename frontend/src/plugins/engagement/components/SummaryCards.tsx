import React from "react";
import { Gauge, Users, UserCheck, CheckCircle2, RotateCcw } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import type { EngagementSummary } from "../types/engagement";

interface SummaryCardsProps {
  summary: EngagementSummary;
}

const scoreColor = (score: number | null) => {
  if (score === null) return "text-muted-foreground";
  if (score >= 80) return "text-success";
  if (score >= 50) return "text-warning";
  return "text-destructive";
};

export const SummaryCards: React.FC<SummaryCardsProps> = ({ summary }) => (
  <div className="flex flex-wrap gap-4">
    <StatCard
      label="Engagement Score"
      value={summary.engagement_score !== null ? summary.engagement_score.toFixed(0) : "—"}
      icon={Gauge}
      valueColorClass={scoreColor(summary.engagement_score)}
      statusDotLabel={summary.is_stale ? "Data is stale" : undefined}
      statusDotClassName={summary.is_stale ? "bg-warning" : undefined}
      trend={summary.is_stale ? "Stale — awaiting recompute" : `${summary.team_count} team(s)`}
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
    />
    <StatCard label="Resubmissions" value={summary.resubmission_count} icon={RotateCcw} />
  </div>
);
