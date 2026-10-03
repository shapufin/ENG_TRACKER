import React from "react";
import { Link } from "react-router-dom";
import {
  CalendarClock,
  CheckCircle2,
  Gauge,
  Hourglass,
  TriangleAlert,
  Users,
  UsersRound,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { InfoCallout } from "@/components/ui/InfoCallout";
import { StatCard } from "@/components/ui/StatCard";
import { toneTextClass } from "@/components/ui/tone";
import type {
  ApprovalEngagementScore,
  EngagementSurveyTeamAverage,
  Scorecard,
} from "../../types/tlScorecard";
import { slaTone } from "./scorecardMeta";

interface ScorecardOverviewProps {
  scorecard: Scorecard;
  engagement: ApprovalEngagementScore | undefined;
  survey: EngagementSurveyTeamAverage | undefined;
}

/** Headline SLA metrics, grouped so each card answers a decision, not a KPI wall. */
export const ScorecardOverview: React.FC<ScorecardOverviewProps> = ({
  scorecard,
  engagement,
  survey,
}) => {
  const { leave, overtime, team_size, seniority } = scorecard;
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Leave decided ≤2 days"
          value={leave.pct_within_2_days !== null ? `${leave.pct_within_2_days}%` : "—"}
          icon={CheckCircle2}
          valueColorClass={slaTone(leave.pct_within_2_days)}
          trend={`${leave.decided_count} decided this month`}
          progressPercent={leave.pct_within_2_days ?? undefined}
        />
        <StatCard
          label="Pending leave at month-end"
          value={leave.pending_at_month_end}
          icon={Hourglass}
          valueColorClass={
            leave.pending_at_month_end === 0 ? toneTextClass.success : toneTextClass.danger
          }
          trend="Target: 0"
        />
        <StatCard
          label="OT approval turnaround"
          value={overtime.avg_turnaround_days !== null ? `${overtime.avg_turnaround_days}d` : "—"}
          icon={CalendarClock}
          trend={`${overtime.decided_count} decided this month`}
        />
        <StatCard label="Team size" value={team_size} icon={Users} />
      </div>

      <section>
        <h2 className="text-muted-foreground text-sm font-semibold">Attrition & Engagement</h2>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <GlassCard animateOnMount={false} isHoverLift={false} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-xs">
                  Approval-behavior engagement (proxy)
                </p>
                <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
                  {engagement?.engagement_score != null
                    ? `${(engagement.engagement_score / 10).toFixed(1)}/10`
                    : "—"}
                </p>
              </div>
              <Gauge className="text-primary/40 h-8 w-8" aria-hidden="true" />
            </div>
            {survey?.average_score != null ? (
              <InfoCallout
                tone={survey.average_score >= 8.5 ? "success" : "warning"}
                className="mt-3"
                label={`Sentiment score (pulse survey) · ${survey.response_count} response(s)`}
                value={`${survey.average_score.toFixed(1)}/10`}
              />
            ) : (
              <InfoCallout
                tone="warning"
                className="mt-3"
                label="No pulse-survey responses yet this period"
                icon={<TriangleAlert className="h-4 w-4" aria-hidden="true" />}
              />
            )}
            <Link
              to="/engagement/metrics"
              className="text-primary mt-3 inline-flex min-h-6 items-center text-xs font-medium hover:underline"
            >
              View full engagement metrics →
            </Link>
          </GlassCard>

          <GlassCard animateOnMount={false} isHoverLift={false} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-xs">Junior / mid / senior ratio</p>
                <p className="mt-1 font-mono text-lg font-bold tabular-nums">
                  {seniority.junior} / {seniority.mid} / {seniority.senior}
                  {seniority.unset > 0 && (
                    <span className="text-muted-foreground ml-2 text-xs font-normal">
                      ({seniority.unset} unset)
                    </span>
                  )}
                </p>
              </div>
              <UsersRound className="text-primary/40 h-8 w-8" aria-hidden="true" />
            </div>
            <p className="text-muted-foreground mt-3 text-xs">
              Certification achievement is tracked on the Skills Matrix but not yet aggregated here.
            </p>
            <Link
              to="/skills"
              className="text-primary mt-3 inline-flex min-h-6 items-center text-xs font-medium hover:underline"
            >
              View Skills Matrix →
            </Link>
          </GlassCard>
        </div>
      </section>
    </>
  );
};
