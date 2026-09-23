import React, { useMemo, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { InfoCallout } from "@/components/ui/InfoCallout";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toneSurfaceClass } from "@/components/ui/tone";
import { downloadBlobResponse } from "@/lib/download";
import { Gauge, RefreshCw, Search, TriangleAlert, Upload } from "lucide-react";
import { SummaryCards } from "../components/SummaryCards";
import { ScoreBreakdownCard } from "../components/ScoreBreakdownCard";
import { TTATrendChart } from "../components/TTATrendChart";
import { AgingBucketChart } from "../components/AgingBucketChart";
import { TeamBreakdownTable } from "../components/TeamBreakdownTable";
import { useEngagementMetrics } from "./hooks/useEngagementMetrics";
import { engagementService } from "../services/engagementService";

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

/** Same 80/50 thresholds SummaryCards uses for score coloring — kept in sync. */
const statusForScore = (score: number | null): { label: string; tone: "success" | "warning" | "danger" } => {
  if (score === null) return { label: "No data", tone: "warning" };
  if (score >= 80) return { label: "Healthy · Above Benchmark", tone: "success" };
  if (score >= 50) return { label: "Watch", tone: "warning" };
  return { label: "At Risk", tone: "danger" };
};

const parseFilenameFromDisposition = (disposition: string | undefined, fallback: string): string => {
  const match = disposition?.match(/filename="?([^"]+)"?/);
  return match?.[1] ?? fallback;
};

export const EngagementMetricsPage: React.FC = () => {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [teamFilter, setTeamFilter] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const { summary, trend, teamBreakdown, isLoading, isFetching, isError, refetch } =
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

  const scoreDelta = useMemo(() => {
    const scored = trend.filter((t) => t.engagement_score !== null);
    if (scored.length < 2) return null;
    const last = scored[scored.length - 1].engagement_score as number;
    const prev = scored[scored.length - 2].engagement_score as number;
    return Math.round(last - prev);
  }, [trend]);

  const filteredTeamBreakdown = useMemo(() => {
    const query = teamFilter.trim().toLowerCase();
    if (!query) return teamBreakdown;
    return teamBreakdown.filter(
      (r) => r.team_name.toLowerCase().includes(query) || r.leader_name.toLowerCase().includes(query)
    );
  }, [teamBreakdown, teamFilter]);

  const handleExport = async (scope: "month" | "year") => {
    const targetMonth = month ?? summary?.month;
    if (!targetMonth) return;
    setIsExporting(true);
    setExportError(null);
    try {
      const response = await engagementService.exportReport(targetMonth, scope);
      const filename = parseFilenameFromDisposition(
        response.headers["content-disposition"],
        `engagement_${scope}_${targetMonth}.xlsx`
      );
      downloadBlobResponse(response.data, filename);
    } catch {
      setExportError("Couldn't generate the report. Check your connection and try again.");
    } finally {
      setIsExporting(false);
    }
  };

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

  const status = statusForScore(summary.engagement_score);

  return (
    <PageShell
      title="My Engagement"
      subtitle={subtitle}
      titleBadge={
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${toneSurfaceClass[status.tone]}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
          {status.label}
        </span>
      }
      actions={
        <>
          {monthOptions.length > 1 && (
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
          )}
          <button
            type="button"
            aria-label="Refresh metrics"
            title="Refresh metrics"
            onClick={() => refetch()}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={isExporting}
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                {isExporting ? "Exporting…" : "Export Report"}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-1.5">
              <button
                type="button"
                onClick={() => handleExport("month")}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
              >
                Export this month
              </button>
              <button
                type="button"
                onClick={() => handleExport("year")}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
              >
                Export full year
              </button>
            </PopoverContent>
          </Popover>
        </>
      }
    >
      <div className="space-y-6">
        {exportError && (
          <InfoCallout
            tone="danger"
            label={exportError}
            icon={<TriangleAlert className="h-4 w-4" aria-hidden="true" />}
          />
        )}
        <SummaryCards summary={summary} scoreDelta={scoreDelta} />
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
        <InfoCallout
          tone="info"
          label="Score = 40% approval speed + 20% approval rate + 20% team activity + 20% consistency. Speed rewards deciding within 4h; activity tracks the share of your team submitting leave/overtime/standby requests."
        />
        <TTATrendChart data={trend} />
        <div className="grid gap-6 md:grid-cols-2">
          <AgingBucketChart rows={teamBreakdown} />
          <ScoreBreakdownCard summary={summary} />
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="text"
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              placeholder="Filter teams..."
              aria-label="Filter teams"
              className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>
        <TeamBreakdownTable rows={filteredTeamBreakdown} />
      </div>
    </PageShell>
  );
};
