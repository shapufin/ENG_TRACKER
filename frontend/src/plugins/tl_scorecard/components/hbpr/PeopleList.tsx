import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CircleDashed, Hourglass, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input } from "@/components/ui/input";
import { toneSurfaceClass } from "@/components/ui/tone";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import { tlScorecardService } from "../../services/tlScorecardService";
import type { HbprPerson } from "../../types/tlScorecard";
import { isForbidden } from "./isForbidden";
import { NoAccess } from "./NoAccess";

const PAGE_SIZE = 25;

const PIP_BADGE = {
  draft: { label: "Awaiting approval", icon: Hourglass, tone: "warning" },
  active: { label: "Active", icon: CircleDashed, tone: "info" },
} as const;

const PipBadge: React.FC<{ state: HbprPerson["open_pip"] }> = ({ state }) => {
  if (!state) return null;
  const { label, icon: Icon, tone } = PIP_BADGE[state];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${toneSurfaceClass[tone]}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
};

export const PeopleList: React.FC = () => {
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const q = useDebouncedValue(search.trim(), 300);

  const query = useQuery({
    queryKey: ["tl-scorecard", "hbpr-people", q, offset, PAGE_SIZE],
    queryFn: () => tlScorecardService.getHbprPeople({ q, limit: PAGE_SIZE, offset }).then((r) => r.data),
    placeholderData: (prev) => prev,
  });

  const onSearch = (value: string) => {
    setSearch(value);
    setOffset(0);
  };

  const page = query.data;
  const body = () => {
    if (query.isError) {
      return isForbidden(query.error) ? (
        <NoAccess />
      ) : (
        <ErrorCard title="Could not load people" onRetry={() => void query.refetch()} className="m-4" />
      );
    }
    if (!page) {
      return (
        <div aria-busy="true" className="space-y-2 p-4">
          <span className="sr-only">Loading people...</span>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-md bg-muted/40" />
          ))}
        </div>
      );
    }
    if (page.count === 0) {
      return q ? (
        <EmptyState icon={Search} title={`No one matches '${q}'`} className="py-8" />
      ) : (
        <EmptyState icon={Users} title="No people in your scope yet" className="py-8" />
      );
    }
    const from = offset + 1;
    const to = offset + page.results.length;
    return (
      <>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border/50">
                <th scope="col" className="px-4 py-2 font-medium">Name</th>
                <th scope="col" className="px-4 py-2 font-medium">Italian TL</th>
                <th scope="col" className="px-4 py-2 font-medium">Albanian TL</th>
                <th scope="col" className="px-4 py-2 font-medium">Last 1-on-1</th>
                <th scope="col" className="px-4 py-2 font-medium">Improvement plan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {page.results.map((p) => (
                <tr key={p.id}>
                  <th scope="row" className="px-4 py-2.5 font-medium">{p.name}</th>
                  <td className="px-4 py-2.5">{p.italian_tl?.name ?? "—"}</td>
                  <td className="px-4 py-2.5">{p.albanian_tl?.name ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {p.last_one_on_one ? formatDateDDMMYYYY(p.last_one_on_one) : "No 1-on-1 yet"}
                  </td>
                  <td className="px-4 py-2.5"><PipBadge state={p.open_pip} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 p-3">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Showing {from}–{to} of {page.count}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 sm:min-h-9"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 sm:min-h-9"
              disabled={to >= page.count}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </>
    );
  };

  return (
    <section aria-labelledby="hbpr-people" className="space-y-3">
      <h2 id="hbpr-people" className="text-lg font-semibold">
        People
      </h2>
      <label className="block max-w-sm">
        <span className="sr-only">Search people</span>
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search people"
          className="min-h-11 sm:min-h-10"
        />
      </label>
      <GlassCard animateOnMount={false} isHoverLift={false} className="p-0">
        {body()}
      </GlassCard>
    </section>
  );
};
