import React from "react";
import { Link } from "react-router-dom";
import {
  CalendarClock,
  CheckCircle2,
  Hourglass,
  TriangleAlert,
  Users,
  UsersRound,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { InfoCallout } from "@/components/ui/InfoCallout";
import { StatCard } from "@/components/ui/StatCard";
import { toneSurfaceClass, toneTextClass } from "@/components/ui/tone";
import type {
  ApprovalEngagementScore,
  EngagementSurveyTeamAverage,
  Scorecard,
} from "../../types/tlScorecard";
import { slaTone, slaWell } from "./scorecardMeta";

interface ScorecardOverviewProps {
  scorecard: Scorecard;
  engagement: ApprovalEngagementScore | undefined;
  survey: EngagementSurveyTeamAverage | undefined;
}

/** Uppercase micro-label shared by every scorecard metric card. */
const MICRO_LABEL = "font-semibold uppercase tracking-wider";

/**
 * Small engagement ring: the score (0-10) as a 0-100% arc. Decorative — the
 * numeric score next to it carries the meaning, so this is aria-hidden.
 */
const EngagementRing: React.FC<{ score: number | null | undefined }> = ({ score }) => {
  const pct = score != null ? Math.min(100, Math.max(0, score * 10)) : 0;
  const R = 26;
  const C = 2 * Math.PI * R;
  return (
    <div
      aria-hidden="true"
      className="relative flex h-16 w-16 shrink-0 items-center justify-center"
    >
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={R} fill="transparent" strokeWidth="7" className="stroke-muted" />
        <circle
          cx="32"
          cy="32"
          r={R}
          fill="transparent"
          strokeWidth="7"
          strokeLinecap="round"
          className="stroke-primary transition-[stroke-dashoffset] duration-500"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct / 100)}
        />
      </svg>
      <span className="text-muted-foreground absolute text-[11px] font-bold">
        {Math.round(pct)}%
      </span>
    </div>
  );
};

/** Junior/mid/senior/unset headcount as a segmented meter with a legend. */
const SeniorityMeter: React.FC<{ junior: number; mid: number; senior: number; unset: number }> = ({
  junior,
  mid,
  senior,
  unset,
}) => {
  const total = junior + mid + senior + unset;
  const segments = [
    { count: junior, label: "Junior", fill: "bg-tone-info-text" },
    { count: mid, label: "Mid", fill: "bg-tone-accent-text" },
    { count: senior, label: "Senior", fill: "bg-tone-success-text" },
    { count: unset, label: "Unset", fill: "bg-muted-foreground/40" },
  ];
  return (
    <div>
      <div
        role="img"
        aria-label={`Junior ${junior}, mid ${mid}, senior ${senior}, unset ${unset}`}
        title={`Junior ${junior} · Mid ${mid} · Senior ${senior} · Unset ${unset}`}
        className="bg-muted flex h-2 w-full overflow-hidden rounded-full"
      >
        {segments.map(
          (s) =>
            s.count > 0 && (
              <div
                key={s.label}
                className={s.fill}
                style={{ width: `${total > 0 ? (s.count / total) * 100 : 0}%` }}
              />
            )
        )}
      </div>
      <div className="text-muted-foreground mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {segments.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${s.fill}`} />
            {s.count} {s.label}
          </span>
        ))}
      </div>
    </div>
  );
};

/** Headline SLA metrics, grouped so each card answers a decision, not a KPI wall. */
export const ScorecardOverview: React.FC<ScorecardOverviewProps> = ({
  scorecard,
  engagement,
  survey,
}) => {
  const { leave, overtime, team_size, seniority } = scorecard;
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Leave decided ≤2 days"
          labelClassName={MICRO_LABEL}
          value={leave.pct_within_2_days !== null ? `${leave.pct_within_2_days}%` : "—"}
          icon={CheckCircle2}
          iconWellClass={slaWell(leave.pct_within_2_days)}
          iconColorClass={slaTone(leave.pct_within_2_days) ?? "text-tone-info-text"}
          valueColorClass={slaTone(leave.pct_within_2_days)}
          trend={`${leave.decided_count} decided this month`}
          progressPercent={leave.pct_within_2_days ?? undefined}
        />
        <StatCard
          label="Pending leave at month-end"
          labelClassName={MICRO_LABEL}
          value={leave.pending_at_month_end}
          icon={Hourglass}
          iconWellClass={`border ${toneSurfaceClass.accent}`}
          iconColorClass={toneTextClass.accent}
          valueColorClass={
            leave.pending_at_month_end === 0 ? toneTextClass.success : toneTextClass.danger
          }
          trend="Target: 0"
        />
        <StatCard
          label="OT approval turnaround"
          labelClassName={MICRO_LABEL}
          value={overtime.avg_turnaround_days !== null ? `${overtime.avg_turnaround_days}d` : "—"}
          icon={CalendarClock}
          iconWellClass={`border ${toneSurfaceClass.info}`}
          iconColorClass={toneTextClass.info}
          trend={`${overtime.decided_count} decided this month`}
        />
        <StatCard
          label="Team size"
          labelClassName={MICRO_LABEL}
          value={team_size}
          icon={Users}
          iconWellClass={`border ${toneSurfaceClass.accent}`}
          iconColorClass={toneTextClass.accent}
          footer={
            <>
              <span className="text-muted-foreground">Active direct reports</span>
              <Link
                to="/team"
                className="text-primary inline-flex min-h-6 shrink-0 items-center text-xs font-semibold whitespace-nowrap hover:underline"
              >
                View Roster →
              </Link>
            </>
          }
        />
      </div>

      <section aria-labelledby="tl-attrition-engagement">
        <h2
          id="tl-attrition-engagement"
          className="text-foreground text-base font-bold tracking-tight"
        >
          Attrition &amp; Engagement
        </h2>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <GlassCard animateOnMount={false} isHoverLift={false} className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={`text-muted-foreground text-xs ${MICRO_LABEL}`}>
                  Approval-behavior engagement (proxy)
                </p>
                <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
                  {engagement?.engagement_score != null
                    ? `${(engagement.engagement_score / 10).toFixed(1)}/10`
                    : "—"}
                </p>
              </div>
              <EngagementRing score={engagement?.engagement_score} />
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
            <div className="border-line-subtle mt-3 flex items-center justify-between gap-2 border-t pt-2">
              <Link
                to="/engagement/metrics"
                className="text-primary inline-flex min-h-6 items-center text-xs font-medium hover:underline"
              >
                View full engagement metrics →
              </Link>
            </div>
          </GlassCard>

          <GlassCard animateOnMount={false} isHoverLift={false} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={`text-muted-foreground text-xs ${MICRO_LABEL}`}>
                  Junior / mid / senior ratio
                </p>
                <p className="mt-1 font-mono text-2xl font-bold tabular-nums">
                  {seniority.junior} / {seniority.mid} / {seniority.senior}
                  {seniority.unset > 0 && (
                    <span className="border-line-subtle bg-muted text-muted-foreground ml-2 rounded-full border px-2 py-0.5 align-middle font-sans text-xs font-semibold">
                      {seniority.unset} unset
                    </span>
                  )}
                </p>
              </div>
              <UsersRound className="text-tone-accent-text h-8 w-8 shrink-0" aria-hidden="true" />
            </div>
            <div className="mt-4">
              <SeniorityMeter
                junior={seniority.junior}
                mid={seniority.mid}
                senior={seniority.senior}
                unset={seniority.unset}
              />
            </div>
            <p className="text-muted-foreground mt-4 text-xs">
              Certification achievement is tracked on the Skills Matrix but not yet aggregated here.
            </p>
            <div className="border-line-subtle mt-3 flex items-center justify-between gap-2 border-t pt-2">
              <Link
                to="/skills"
                className="text-primary inline-flex min-h-6 items-center text-xs font-medium hover:underline"
              >
                View Skills Matrix →
              </Link>
            </div>
          </GlassCard>
        </div>
      </section>
    </>
  );
};
