import React from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { EprReview } from "../components/myRecords/EprReview";
import { ImprovementPlan } from "../components/myRecords/ImprovementPlan";
import { OneOnOneTimeline } from "../components/myRecords/OneOnOneTimeline";
import { getMyRecords } from "../services/myRecordsService";

const Skeleton: React.FC = () => (
  <div aria-busy="true" className="space-y-3">
    <span className="sr-only">Loading your records...</span>
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="h-24 animate-pulse rounded-lg border bg-muted/40" />
    ))}
  </div>
);

export const MyRecordsPage: React.FC = () => {
  const query = useQuery({ queryKey: ["tl-scorecard", "my-records"], queryFn: getMyRecords });
  const data = query.data;
  const isEmpty =
    !!data && !data.one_on_ones.length && !data.pips.length && !data.epr_cycles.length;

  return (
    <PageShell title="My records" subtitle="What your team leader has shared about your growth">
      <div className="mx-auto w-full max-w-2xl space-y-8">
        {data ? (
          isEmpty ? (
            <EmptyState
              icon={FileText}
              title="Nothing shared yet"
              description="Summaries your team leader shares will appear here."
            />
          ) : (
            <>
              {data.epr_cycles.length > 0 && <EprReview cycles={data.epr_cycles} />}
              {data.pips.length > 0 && <ImprovementPlan pips={data.pips} />}
              <OneOnOneTimeline items={data.one_on_ones} />
            </>
          )
        ) : query.isError ? (
          <ErrorCard title="Could not load your records" onRetry={() => void query.refetch()} />
        ) : (
          <Skeleton />
        )}
      </div>
    </PageShell>
  );
};
