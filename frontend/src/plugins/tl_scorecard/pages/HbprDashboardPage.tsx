import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarClock, FileClock, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { StatCard } from "@/components/ui/StatCard";
import { isForbidden } from "../components/hbpr/isForbidden";
import { NoAccess } from "../components/hbpr/NoAccess";
import { tlScorecardService } from "../services/tlScorecardService";

const Skeleton: React.FC = () => (
  <div aria-busy="true" className="grid gap-3 sm:grid-cols-3">
    <span className="sr-only">Loading the HBPR summary…</span>
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="bg-muted/40 h-24 animate-pulse rounded-xl border" />
    ))}
  </div>
);

/**
 * Compact HBPR summary injected into the dashboard's `hbpr-dashboard` slot.
 * Deliberately not the full workspace — it links to `/hbpr` instead of
 * duplicating that page.
 */
export const HbprDashboardPage: React.FC = () => {
  // Same key shape as the workspace page's current-year query, so navigating
  // dashboard → /hbpr reuses the cache instead of refetching the same data.
  const overview = useQuery({
    queryKey: ["tl-scorecard", "hbpr-overview", new Date().getFullYear()],
    queryFn: async () => (await tlScorecardService.getHbprOverview()).data,
  });

  if (overview.isError) {
    return isForbidden(overview.error) ? (
      <NoAccess />
    ) : (
      <ErrorCard title="Could not load the HBPR summary" onRetry={() => void overview.refetch()} />
    );
  }

  if (overview.isLoading || !overview.data) return <Skeleton />;

  const { leaders, needs_attention: attention } = overview.data;
  const eprMissing = attention.missing_mid_year_evidence + attention.missing_year_end_evidence;

  return (
    <section aria-labelledby="hbpr-widget" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="hbpr-widget" className="text-lg font-semibold">
          HBPR Workspace
        </h2>
        <Button asChild variant="outline" size="sm">
          <Link to="/hbpr">
            Open HBPR Workspace
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Assigned team leaders" value={leaders.length} icon={UsersRound} />
        <StatCard
          label="Cadence overdue"
          value={attention.cadence_overdue}
          icon={CalendarClock}
          valueColorClass={
            attention.cadence_overdue === 0 ? "text-tone-success-text" : "text-tone-danger-text"
          }
        />
        <StatCard
          label="EPR evidence missing"
          value={eprMissing}
          icon={FileClock}
          valueColorClass={eprMissing === 0 ? "text-tone-success-text" : "text-tone-warning-text"}
        />
      </div>
    </section>
  );
};
