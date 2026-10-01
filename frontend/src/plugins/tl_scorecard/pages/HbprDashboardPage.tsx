import React from "react";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/layout/PageShell";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { NeedsAttention } from "../components/hbpr/NeedsAttention";
import { isForbidden } from "../components/hbpr/isForbidden";
import { NoAccess } from "../components/hbpr/NoAccess";
import { PeopleList } from "../components/hbpr/PeopleList";
import { TeamLeadersTable } from "../components/hbpr/TeamLeadersTable";
import { tlScorecardService } from "../services/tlScorecardService";

const Skeleton: React.FC = () => (
  <div aria-busy="true" className="grid gap-3 sm:grid-cols-2">
    <span className="sr-only">Loading overview...</span>
    {Array.from({ length: 2 }).map((_, i) => (
      <div key={i} className="h-28 animate-pulse rounded-lg border bg-muted/40" />
    ))}
  </div>
);

export const HbprDashboardPage: React.FC = () => {
  const overview = useQuery({
    queryKey: ["tl-scorecard", "hbpr-overview"],
    queryFn: () => tlScorecardService.getHbprOverview().then((r) => r.data),
  });

  return (
    <PageShell title="HBPR dashboard" subtitle="Italy team leaders and the people you partner with">
      {overview.data ? (
        <>
          <NeedsAttention overview={overview.data} />
          <TeamLeadersTable tls={overview.data.tls} />
        </>
      ) : overview.isError ? (
        isForbidden(overview.error) ? (
          <NoAccess />
        ) : (
          <ErrorCard title="Could not load the overview" onRetry={() => void overview.refetch()} />
        )
      ) : (
        <Skeleton />
      )}
      <PeopleList />
    </PageShell>
  );
};
