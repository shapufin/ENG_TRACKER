import React, { useMemo, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { InfoCallout } from "@/components/ui/InfoCallout";
import { Gauge, TriangleAlert } from "lucide-react";
import { SummaryCards } from "../components/SummaryCards";
import { ScoreBreakdownCard } from "../components/ScoreBreakdownCard";
import { TTATrendChart } from "../components/TTATrendChart";
import { AgingBucketChart } from "../components/AgingBucketChart";
import { TeamBreakdownTable } from "../components/TeamBreakdownTable";
import { useEngagementMetrics } from "./hooks/useEngagementMetrics";

const LoadingState: React.FC = () => (
  <PageShell title="My Engagement">
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only">Loading...</span>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg border bg-muted/40" />
        ))}
      </div>
      <div className="h-[280px] animate-pulse rounded-lg border bg-muted/40 sm:h-[350px]" />
      <div className="grid gap-6 md:grid-cols-2">
        <div className="h-[280px] animate-pulse rounded-lg border bg-muted/40 sm:h-[350px]" />
        <div className="h-64 animate-pulse rounded-lg border bg-muted/40" />
      </div>
    </div>
  </PageShell>
);

const formatMonthLabel = (month: string | null): string => {
  if (!month) return "latest snapshot";
  const d = new Date(`${month}T00:00:00`);
  if (Number.isNaN(d.getTime())) return month;
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
};

export const EngagementMetricsPage: React.FC = () => {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const { summary, trend, teamBreakdown, isLoading, isError, refetch } =
    useEngagementMetrics(month);

  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    if (summary?.month) months.add(summary.month);
    for (const t of trend) {
      const iso = t.month.length === 7 ? `${t.month}-01` : t.month;
      months.add(iso);
    }
    return [...months].sort().reverse();
  }, [summary, trend]);

  const pendingTotal = useMemo(
    () =>
      teamBreakdown.reduce(
        (acc, r) =>
          acc +
          (r.metrics.leave?.pending_over_48h ?? 0) +
          (r.metrics.overtime?.pending_over_48h ?? 0) +
          (r.metrics.standby?.pending_over_48h ?? 0),
        0
      ),
    [teamBreakdown]
  );

  if (isLoading || (!summary && !isError)) return <LoadingState />;

  if (isError || !summary) {
    return (
      <PageShell title="My Engagement" subtitle="Your approval responsiveness at a glance">
        <ErrorCard
          title="Couldn't load engagement metrics"
          message="Check your connection and try again."
          onRetry={refetch}
        />
      </PageShell>
    );
  }

  if (summary.team_count === 0) {
    return (
      <PageShell title="My Engagement">
        <EmptyState
          icon={Gauge}
          title="No engagement data yet"
          description="Metrics appear here once a monthly snapshot has been computed for your team."
        />
      </PageShell>
    );
  }

  const subtitle = `${formatMonthLabel(summary.month)} · ${summary.team_count} team(s)${
    summary.computed_at ? ` · computed ${new Date(summary.computed_at).toLocaleDateString()}` : ""
  }${summary.is_stale ? " · stale" : ""}`;

  return (
    <PageShell
      title="My Engagement"
      subtitle={subtitle}
      actions={
        monthOptions.length > 1 ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Month
            <select
              aria-label="Snapshot month"
              className="h-9 rounded-xl border border-border bg-card px-2 text-sm text-foreground"
              value={month ?? summary.month ?? ""}
              onChange={(e) => setMonth(e.target.value || undefined)}
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {formatMonthLabel(m)}
                </option>
              ))}
            </select>
          </label>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <SummaryCards summary={summary} />
        {summary.is_stale && (
          <InfoCallout
            tone="warning"
            label="This snapshot is stale — newer requests arrived after it was computed. Monthly recompute refreshes it."
            icon={<TriangleAlert className="h-4 w-4" aria-hidden="true" />}
          />
        )}
        {pendingTotal > 0 && (
          <InfoCallout
            tone="danger"
            label={`${pendingTotal} request(s) waiting over 48h — clear these first, they hurt your score most.`}
            value={pendingTotal}
          />
        )}
        <TTATrendChart data={trend} />
        <div className="grid gap-6 md:grid-cols-2">
          <AgingBucketChart rows={teamBreakdown} />
          <ScoreBreakdownCard rows={teamBreakdown} />
        </div>
        <TeamBreakdownTable rows={teamBreakdown} />
      </div>
    </PageShell>
  );
};
