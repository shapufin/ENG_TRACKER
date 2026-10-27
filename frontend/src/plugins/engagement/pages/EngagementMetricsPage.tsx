import React, { useMemo, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { InfoCallout } from "@/components/ui/InfoCallout";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SearchField } from "@/components/ui/SearchField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toneSurfaceClass } from "@/components/ui/tone";
import { downloadBlobResponse, parseFilenameFromDisposition } from "@/lib/download";
import {
  FileSpreadsheet,
  FileText,
  Gauge,
  LineChart,
  RefreshCw,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { SummaryCards } from "../components/SummaryCards";
import { ScoreBreakdownCard } from "../components/ScoreBreakdownCard";
import { TTATrendChart } from "../components/TTATrendChart";
import { AgingBucketChart } from "../components/AgingBucketChart";
import { ScoreCompositionTrendChart } from "../components/ScoreCompositionTrendChart";
import { RequestVolumeChart } from "../components/RequestVolumeChart";
import { TeamBreakdownTable } from "../components/TeamBreakdownTable";
import { useEngagementMetrics } from "./hooks/useEngagementMetrics";
import { engagementService } from "../services/engagementService";

const LoadingState: React.FC = () => (
  <PageShell title="My Engagement">
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only">Loading...</span>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-muted/40 h-24 animate-pulse rounded-lg border" />
        ))}
      </div>
      <div className="bg-muted/40 h-[280px] animate-pulse rounded-lg border sm:h-[350px]" />
      <div className="grid gap-6 md:grid-cols-2">
        <div className="bg-muted/40 h-[280px] animate-pulse rounded-lg border sm:h-[350px]" />
        <div className="bg-muted/40 h-64 animate-pulse rounded-lg border" />
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
const statusForScore = (
  score: number | null
): { label: string; tone: "success" | "warning" | "danger" } => {
  if (score === null) return { label: "No data", tone: "warning" };
  if (score >= 80) return { label: "Healthy · Above Benchmark", tone: "success" };
  if (score >= 50) return { label: "Watch", tone: "warning" };
  return { label: "At Risk", tone: "danger" };
};

export const EngagementMetricsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const month = searchParams.get("month") ?? undefined;
  const setMonth = (value: string | undefined) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set("month", value);
        else next.delete("month");
        return next;
      },
      { replace: true }
    );
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
          (r.metrics.leave?.pending_past_deadline ?? 0) +
          (r.metrics.overtime?.pending_past_deadline ?? 0) +
          (r.metrics.standby?.pending_past_deadline ?? 0),
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
      (r) =>
        r.team_name.toLowerCase().includes(query) || r.leader_name.toLowerCase().includes(query)
    );
  }, [teamBreakdown, teamFilter]);

  const handleExport = async (scope: "month" | "year", fileFormat: "xlsx" | "pdf") => {
    const targetMonth = month ?? summary?.month;
    if (!targetMonth) return;
    setIsExporting(true);
    setExportError(null);
    try {
      const response = await engagementService.exportReport(targetMonth, scope, fileFormat);
      const filename = parseFilenameFromDisposition(
        response.headers["content-disposition"],
        `engagement_${scope}_${targetMonth}.${fileFormat}`
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
  }${summary.refreshed_on_read ? " · just refreshed" : ""}${summary.frozen ? " · Frozen" : ""}`;

  const status = statusForScore(summary.engagement_score);

  return (
    <PageShell
      title="My Engagement"
      subtitle={subtitle}
      titleBadge={
        <span
          role="status"
          aria-label={status.label}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${toneSurfaceClass[status.tone]}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
          {status.label}
        </span>
      }
      actions={
        <>
          {monthOptions.length > 1 && (
            <label className="text-muted-foreground flex items-center gap-2 text-xs">
              Month
              <Select
                value={month ?? summary.month ?? ""}
                onValueChange={(value) => setMonth(value || undefined)}
              >
                <SelectTrigger controlSize="sm" aria-label="Snapshot month" className="w-44">
                  <SelectValue>{formatMonthLabel(month ?? summary.month)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((m) => (
                    <SelectItem key={m} value={m}>
                      {formatMonthLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )}
          <Button
            type="button"
            variant="outline"
            size="control-icon-sm"
            aria-label="Refresh metrics"
            title="Refresh metrics"
            onClick={() => refetch()}
          >
            <RefreshCw
              className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
          </Button>
          <Button asChild variant="outline" size="control-sm">
            <Link to={month ? `/engagement/visualize?month=${month}` : "/engagement/visualize"}>
              <LineChart className="mr-2 h-4 w-4" aria-hidden="true" />
              Visualize
            </Link>
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" size="control-sm" disabled={isExporting}>
                <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                {isExporting ? "Exporting…" : "Export Report"}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-1.5">
              <button
                type="button"
                onClick={() => handleExport("month", "xlsx")}
                className="hover:bg-muted flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm"
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                Excel — this month
              </button>
              <button
                type="button"
                onClick={() => handleExport("year", "xlsx")}
                className="hover:bg-muted flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm"
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                Excel — full year
              </button>
              <div className="bg-border my-1 h-px" role="separator" />
              <button
                type="button"
                onClick={() => handleExport("month", "pdf")}
                className="hover:bg-muted flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm"
              >
                <FileText className="h-4 w-4" aria-hidden="true" />
                PDF report — this month
              </button>
              <button
                type="button"
                onClick={() => handleExport("year", "pdf")}
                className="hover:bg-muted flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm"
              >
                <FileText className="h-4 w-4" aria-hidden="true" />
                PDF report — full year
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
        {pendingTotal > 0 && (
          <InfoCallout
            tone="danger"
            label={`${pendingTotal} request(s) past their deadline — each counts as a breach until it is decided.`}
            value={pendingTotal}
          />
        )}
        <TTATrendChart data={trend} />
        <div className="grid gap-6 md:grid-cols-2">
          <AgingBucketChart rows={teamBreakdown} />
          <ScoreBreakdownCard summary={summary} />
          <ChartCard
            title="Score Composition Trend"
            description="Which component is moving, and since when"
          >
            <ScoreCompositionTrendChart data={trend} />
          </ChartCard>
          <ChartCard title="Request Volume" description="Approved, rejected, and pending, by type">
            <RequestVolumeChart rows={teamBreakdown} />
          </ChartCard>
        </div>
        <SearchField
          value={teamFilter}
          onChange={setTeamFilter}
          placeholder="Filter teams..."
          aria-label="Filter teams"
          controlSize="sm"
          className="max-w-xs"
        />
        <TeamBreakdownTable rows={filteredTeamBreakdown} />
      </div>
    </PageShell>
  );
};
