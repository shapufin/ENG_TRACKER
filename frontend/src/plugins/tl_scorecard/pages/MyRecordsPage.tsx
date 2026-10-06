import React from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, FileText, Flag, MessagesSquare, Sprout } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { StatCard } from "@/components/ui/StatCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EprReview } from "../components/myRecords/EprReview";
import { stepsOf } from "../components/myRecords/eprSteps";
import { ImprovementPlan } from "../components/myRecords/ImprovementPlan";
import { OneOnOneTimeline } from "../components/myRecords/OneOnOneTimeline";
import { getMyRecords } from "../services/myRecordsService";
import type { MyRecords } from "../types/myRecords";

const Skeleton: React.FC = () => (
  <div aria-busy="true" className="space-y-3">
    <span className="sr-only">Loading your records...</span>
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="bg-muted/40 h-24 animate-pulse rounded-lg border" />
    ))}
  </div>
);

const GrowthSummary: React.FC<{ data: MyRecords }> = ({ data }) => {
  const cycles = [...data.epr_cycles].sort((a, b) => b.year - a.year);
  const active = cycles.find((c) => stepsOf(c).some((s) => !s.at));
  const milestones = cycles.flatMap(stepsOf);
  const done = milestones.filter((s) => s.at).length;
  const hasActivePlan = data.pips.some((p) => p.status === "active");
  return (
    <section
      aria-label="Growth summary"
      className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4"
    >
      <StatCard
        label="Active review cycle"
        value={active ? String(active.year) : cycles.length ? "All complete" : "—"}
        icon={CalendarCheck}
      />
      <StatCard
        label="Milestones completed"
        value={`${done} of ${milestones.length}`}
        icon={Flag}
      />
      <StatCard label="1-on-1 meetings" value={data.one_on_ones.length} icon={MessagesSquare} />
      <StatCard
        label="Development status"
        value={
          <span className="font-sans text-base">
            {hasActivePlan ? "Improvement plan active" : "No active plan"}
          </span>
        }
        icon={Sprout}
      />
    </section>
  );
};

export const MyRecordsPage: React.FC = () => {
  const query = useQuery({ queryKey: ["tl-scorecard", "my-records"], queryFn: getMyRecords });
  const data = query.data;
  const isEmpty =
    !!data && !data.one_on_ones.length && !data.pips.length && !data.epr_cycles.length;

  return (
    <PageShell title="My records" subtitle="What your team leader has shared about your growth">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        {data ? (
          isEmpty ? (
            <EmptyState
              icon={FileText}
              title="Nothing shared yet"
              description="Summaries your team leader shares will appear here."
            />
          ) : (
            <>
              <GrowthSummary data={data} />
              <Tabs defaultValue="reviews">
                <TabsList className="h-auto max-w-full flex-wrap justify-start">
                  <TabsTrigger value="reviews" className="min-h-11 sm:min-h-9">
                    Performance reviews
                  </TabsTrigger>
                  <TabsTrigger value="one-on-ones" className="min-h-11 sm:min-h-9">
                    1-on-1 feedback
                  </TabsTrigger>
                  {data.pips.length > 0 && (
                    <TabsTrigger value="coaching" className="min-h-11 sm:min-h-9">
                      Improvement &amp; coaching
                    </TabsTrigger>
                  )}
                </TabsList>
                <TabsContent value="reviews" className="mt-4">
                  {data.epr_cycles.length > 0 ? (
                    <EprReview cycles={data.epr_cycles} />
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      Your review cycles will appear here once your team leader starts one.
                    </p>
                  )}
                </TabsContent>
                <TabsContent value="one-on-ones" className="mt-4">
                  <OneOnOneTimeline items={data.one_on_ones} />
                </TabsContent>
                {data.pips.length > 0 && (
                  <TabsContent value="coaching" className="mt-4">
                    <ImprovementPlan pips={data.pips} />
                  </TabsContent>
                )}
              </Tabs>
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
