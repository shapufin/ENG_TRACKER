import React from "react";
import { PageShell } from "@/components/layout/PageShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { Gauge } from "lucide-react";
import { SummaryCards } from "../components/SummaryCards";
import { TTATrendChart } from "../components/TTATrendChart";
import { AgingBucketChart } from "../components/AgingBucketChart";
import { TeamBreakdownTable } from "../components/TeamBreakdownTable";
import { useEngagementMetrics } from "./hooks/useEngagementMetrics";

const LoadingState: React.FC = () => (
  <PageShell title="My Engagement">
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only">Loading...</span>
      <div className="flex flex-wrap gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 w-48 animate-pulse rounded-lg border bg-muted/40" />
        ))}
      </div>
      <div className="h-[350px] animate-pulse rounded-lg border bg-muted/40" />
      <div className="grid gap-6 md:grid-cols-2">
        <div className="h-[350px] animate-pulse rounded-lg border bg-muted/40" />
        <div className="h-64 animate-pulse rounded-lg border bg-muted/40" />
      </div>
    </div>
  </PageShell>
);

export const EngagementMetricsPage: React.FC = () => {
  const { summary, trend, teamBreakdown, isLoading } = useEngagementMetrics();

  if (isLoading || !summary) return <LoadingState />;

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

  return (
    <PageShell title="My Engagement">
      <div className="space-y-6">
        <SummaryCards summary={summary} />
        <TTATrendChart data={trend} />
        <div className="grid gap-6 md:grid-cols-2">
          <AgingBucketChart rows={teamBreakdown} />
          <TeamBreakdownTable rows={teamBreakdown} />
        </div>
      </div>
    </PageShell>
  );
};
