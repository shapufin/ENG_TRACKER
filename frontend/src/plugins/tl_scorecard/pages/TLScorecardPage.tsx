import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Gauge,
  Handshake,
  Hourglass,
  PhoneCall,
  TriangleAlert,
  UserX,
  Users,
  UsersRound,
} from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { GlassCard } from "@/components/ui/GlassCard";
import { InfoCallout } from "@/components/ui/InfoCallout";
import { StatCard } from "@/components/ui/StatCard";
import { toneTextClass } from "@/components/ui/tone";
import { engagementService } from "@/plugins/engagement/services/engagementService";
import { KpiCoveragePanel } from "../components/KpiCoveragePanel";
import { tlScorecardService } from "../services/tlScorecardService";

const LoadingState: React.FC = () => (
  <PageShell title="TL Scorecard">
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-busy="true">
      <span className="sr-only">Loading...</span>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-lg border bg-muted/40" />
      ))}
    </div>
  </PageShell>
);

const slaTone = (pct: number | null) => {
  if (pct === null) return undefined;
  if (pct >= 90) return toneTextClass.success;
  if (pct >= 70) return toneTextClass.warning;
  return toneTextClass.danger;
};

export const TLScorecardPage: React.FC = () => {
  const scorecardQuery = useQuery({
    queryKey: ["tl-scorecard", "scorecard"],
    queryFn: async () => (await tlScorecardService.getScorecard()).data,
  });
  const coverageQuery = useQuery({
    queryKey: ["tl-scorecard", "kpi-coverage"],
    queryFn: async () => (await tlScorecardService.getKpiCoverage()).data,
  });
  const engagementQuery = useQuery({
    queryKey: ["tl-scorecard", "engagement-summary"],
    queryFn: async () => (await engagementService.getSummary()).data,
  });
  const surveyQuery = useQuery({
    queryKey: ["tl-scorecard", "engagement-survey-average"],
    queryFn: async () => (await tlScorecardService.getEngagementSurveyTeamAverage()).data,
  });

  if (scorecardQuery.isLoading) return <LoadingState />;

  if (scorecardQuery.isError || !scorecardQuery.data) {
    return (
      <PageShell title="TL Scorecard">
        <ErrorCard
          title="Couldn't load your scorecard"
          message="Check your connection and try again."
          onRetry={() => scorecardQuery.refetch()}
        />
      </PageShell>
    );
  }

  const { leave, overtime, team_size, month, meetings, idle, review_deliveries_ytd, seniority } =
    scorecardQuery.data;
  const monthLabel = new Date(`${month}T00:00:00`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <PageShell title="TL Scorecard" subtitle={`${monthLabel} · ${team_size} team member(s)`}>
      <div className="space-y-6">
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
            valueColorClass={leave.pending_at_month_end === 0 ? toneTextClass.success : toneTextClass.danger}
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
          <h2 className="text-sm font-semibold text-muted-foreground">Attrition & Engagement</h2>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <GlassCard animateOnMount={false} isHoverLift={false} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Approval-behavior engagement (proxy)</p>
                  <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
                    {engagementQuery.data?.engagement_score != null
                      ? `${(engagementQuery.data.engagement_score / 10).toFixed(1)}/10`
                      : "—"}
                  </p>
                </div>
                <Gauge className="h-8 w-8 text-primary/40" aria-hidden="true" />
              </div>
              {surveyQuery.data?.average_score != null ? (
                <InfoCallout
                  tone={surveyQuery.data.average_score >= 8.5 ? "success" : "warning"}
                  className="mt-3"
                  label={`Sentiment score (pulse survey) · ${surveyQuery.data.response_count} response(s)`}
                  value={`${surveyQuery.data.average_score.toFixed(1)}/10`}
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
                className="mt-3 inline-block text-xs font-medium text-primary hover:underline"
              >
                View full engagement metrics →
              </Link>
            </GlassCard>

            <GlassCard animateOnMount={false} isHoverLift={false} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Junior / mid / senior ratio</p>
                  <p className="mt-1 font-mono text-lg font-bold tabular-nums">
                    {seniority.junior} / {seniority.mid} / {seniority.senior}
                    {seniority.unset > 0 && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        ({seniority.unset} unset)
                      </span>
                    )}
                  </p>
                </div>
                <UsersRound className="h-8 w-8 text-primary/40" aria-hidden="true" />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Certification achievement is tracked on the Skills Matrix but not yet aggregated here.
              </p>
              <Link to="/skills" className="mt-3 inline-block text-xs font-medium text-primary hover:underline">
                View Skills Matrix →
              </Link>
            </GlassCard>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-muted-foreground">Communication</h2>
          <div className="mt-2 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="1-on-1 compliance"
              value={meetings.one_on_one_compliance_pct !== null ? `${meetings.one_on_one_compliance_pct}%` : "—"}
              icon={Handshake}
              valueColorClass={slaTone(meetings.one_on_one_compliance_pct)}
              trend="Target: 100%"
              progressPercent={meetings.one_on_one_compliance_pct ?? undefined}
            />
            <StatCard
              label="TL-Italy syncs"
              value={meetings.tl_sync_count}
              icon={PhoneCall}
              trend="This month · target ≥45/year"
            />
            <StatCard
              label="Team meetings with HRBP"
              value={`${meetings.team_meetings_with_hrbp}/${meetings.team_meetings_held}`}
              icon={UsersRound}
              trend={`${meetings.team_meeting_notes_within_24h} notes sent within 24h`}
            />
            <StatCard label="Management reviews (YTD)" value={review_deliveries_ytd} icon={ClipboardList} trend="Target: ≥12/year" />
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-muted-foreground">Idle Management</h2>
          <div className="mt-2 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Open idle flags"
              value={idle.open_count}
              icon={UserX}
              valueColorClass={idle.open_count === 0 ? toneTextClass.success : toneTextClass.warning}
            />
            <StatCard label="Resolved idle flags" value={idle.resolved_count} icon={CheckCircle2} />
          </div>
        </section>

        {coverageQuery.data && <KpiCoveragePanel entries={coverageQuery.data} />}
      </div>
    </PageShell>
  );
};
