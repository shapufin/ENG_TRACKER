import React, { useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import { PageShell } from "@/components/layout/PageShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { InfoCallout } from "@/components/ui/InfoCallout";
import { toneSurfaceClass, toneTextClass } from "@/components/ui/tone";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/visualization/chart";
import { ChartSection } from "@/components/visualization/ChartSection";
import { captureChartsToPdf } from "@/components/visualization/pdfExport";
import { ScoreCompositionTrendChart } from "../components/ScoreCompositionTrendChart";
import { RequestVolumeChart } from "../components/RequestVolumeChart";
import { TeamComparisonChart } from "../components/TeamComparisonChart";
import { staggerContainer } from "@/lib/motion";
import { formatMonthTick } from "@/lib/monthOptions";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Gauge,
  HeartHandshake,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { useEngagementMetrics } from "./hooks/useEngagementMetrics";

const trendConfig: ChartConfig = {
  engagement_score: { label: "Engagement Score", color: "hsl(var(--chart-1))" },
  avg_tta_hours: { label: "Avg TTA (hours)", color: "hsl(var(--chart-2))" },
};

const agingConfig: ChartConfig = {
  leave: { label: "Leave", color: "hsl(var(--chart-1))" },
  overtime: { label: "Overtime", color: "hsl(var(--chart-2))" },
  standby: { label: "Standby", color: "hsl(var(--chart-3))" },
};

const BUCKET_ORDER = ["<4h", "4-24h", "1-3d", ">3d"] as const;
const REQUEST_TYPES = ["leave", "overtime", "standby"] as const;

/** Same 80/50 thresholds SummaryCards/EngagementMetricsPage use — kept in sync. */
const scoreTone = (score: number | null): "success" | "warning" | "danger" => {
  if (score === null) return "warning";
  if (score >= 80) return "success";
  if (score >= 50) return "warning";
  return "danger";
};

/** Bare custom-property names — the tokens hold an "H S% L%" triple, so every
 * use site must still wrap them in `hsl(var(...))` (see `TTATrendChart`). */
const TONE_VAR_NAME: Record<"success" | "warning" | "danger", string> = {
  success: "--tone-success-text",
  warning: "--tone-warning-text",
  danger: "--tone-danger-text",
};

export const EngagementVisualizationPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const month = searchParams.get("month") ?? undefined;
  const { summary, trend, teamBreakdown, isLoading, isError, refetch } =
    useEngagementMetrics(month);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const galleryRef = useRef<HTMLDivElement>(null);

  const scoreDelta = useMemo(() => {
    const scored = trend.filter((t) => t.engagement_score !== null);
    if (scored.length < 2) return null;
    const last = scored[scored.length - 1].engagement_score as number;
    const prev = scored[scored.length - 2].engagement_score as number;
    return Math.round(last - prev);
  }, [trend]);

  const handleExportPdf = async () => {
    if (!galleryRef.current) return;
    setIsExporting(true);
    setExportError(null);
    try {
      const period = summary?.month ?? "latest";
      await captureChartsToPdf(galleryRef.current, {
        title: `TL Engagement — Visual Report (${period})`,
        filename: `engagement_visual_${period}.pdf`,
      });
    } catch {
      setExportError("Couldn't generate the PDF. Check your connection and try again.");
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <PageShell title="Engagement Visualization">
        <div className="h-96 animate-pulse rounded-lg border bg-muted/40" />
      </PageShell>
    );
  }

  if (isError || !summary) {
    return (
      <PageShell title="Engagement Visualization">
        <ErrorCard
          title="Couldn't load visualization data"
          message="Check your connection and try again."
          onRetry={refetch}
        />
      </PageShell>
    );
  }

  if (summary.team_count === 0) {
    return (
      <PageShell title="Engagement Visualization">
        <EmptyState
          icon={Gauge}
          title="No engagement data yet"
          description="Charts appear here once a monthly snapshot has been computed for your team."
        />
      </PageShell>
    );
  }

  const agingData = BUCKET_ORDER.map((bucket) => {
    const row: Record<string, string | number> = { bucket };
    for (const type of REQUEST_TYPES) {
      row[type] = teamBreakdown.reduce(
        (sum, r) => sum + (r.metrics[type]?.aging?.[bucket] ?? 0),
        0
      );
    }
    return row;
  });

  const score = summary.engagement_score;
  const tone = scoreTone(score);
  const ringPercent = Math.max(0, Math.min(100, score ?? 0));
  const ringDeg = (ringPercent / 100) * 360;
  const ringVarName = TONE_VAR_NAME[tone];
  const ringColor = `hsl(var(${ringVarName}))`;
  const ringGlow = `hsl(var(${ringVarName}) / 0.35)`;

  return (
    <PageShell
      title="Engagement Visualization"
      subtitle="High-density charts for KPI review and year-end reporting"
      actions={
        <>
          <Link
            to={month ? `/engagement/metrics?month=${month}` : "/engagement/metrics"}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to metrics
          </Link>
          <button
            type="button"
            disabled={isExporting}
            onClick={handleExportPdf}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_hsl(var(--primary))] transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {isExporting ? "Exporting…" : "Export PDF"}
          </button>
        </>
      }
    >
      <motion.div
        ref={galleryRef}
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
        className="grid gap-6"
      >
        {exportError && (
          <InfoCallout
            tone="danger"
            label={exportError}
            icon={<TriangleAlert className="h-4 w-4" aria-hidden="true" />}
          />
        )}
        {/* Hero score — big gradient number is the headline, the ring is a
         * decorative accent, and a faint sparkline of the score trend gives
         * the card depth instead of a flat fill. */}
        <ChartSection id="viz-score">
          <div className="relative -m-5 overflow-hidden rounded-xl p-5">
            {trend.length > 1 && (
              <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden="true">
                <ChartContainer config={trendConfig} className="aspect-auto h-full w-full">
                  <AreaChart data={trend} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="heroSparkline" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={ringColor} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={ringColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="engagement_score"
                      stroke="none"
                      fill="url(#heroSparkline)"
                      isAnimationActive={false}
                      connectNulls
                    />
                  </AreaChart>
                </ChartContainer>
              </div>
            )}

            <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
              <div className="text-center sm:text-left">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Composite Engagement Score
                </p>
                <div className="mt-2 flex items-baseline justify-center gap-2 sm:justify-start">
                  <span
                    className="bg-gradient-to-br from-[hsl(var(--chart-1))] to-[hsl(var(--chart-2))] bg-clip-text font-mono text-6xl font-black tabular-nums tracking-tight text-transparent sm:text-7xl"
                    style={{ filter: `drop-shadow(0 0 24px ${ringGlow})` }}
                  >
                    {score !== null ? Math.round(score) : "—"}
                  </span>
                  <span className="text-xl font-semibold text-muted-foreground">/ 100</span>
                </div>
                <div className="mt-3 flex items-center justify-center gap-2 sm:justify-start">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${toneSurfaceClass[tone]}`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                    {tone === "success" ? "Healthy" : tone === "warning" ? "Watch" : "At Risk"}
                  </span>
                  {scoreDelta !== null && (
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold ${
                        scoreDelta >= 0 ? toneTextClass.success : toneTextClass.danger
                      }`}
                    >
                      {scoreDelta >= 0 ? (
                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {Math.abs(scoreDelta)} pts vs last month
                    </span>
                  )}
                </div>
                {(summary.resubmission_count > 0 || summary.decisions_during_leave > 0) && (
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                    {summary.resubmission_count > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        {summary.resubmission_count} resubmission
                        {summary.resubmission_count === 1 ? "" : "s"}
                      </span>
                    )}
                    {summary.decisions_during_leave > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-tone-success-surface px-2.5 py-0.5 text-[11px] font-medium text-tone-success-text">
                        <HeartHandshake className="h-3 w-3" aria-hidden="true" />
                        {summary.decisions_during_leave} decided while on leave
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div
                className="relative flex h-32 w-32 shrink-0 items-center justify-center rounded-full"
                role="img"
                aria-label={
                  score === null
                    ? "Engagement score ring, no data"
                    : `Engagement score ring, ${ringPercent} of 100`
                }
              >
                <div
                  className="absolute inset-0 rounded-full transition-[background] duration-700"
                  style={{
                    background: `conic-gradient(${ringColor} ${ringDeg}deg, hsl(var(--muted)) ${ringDeg}deg)`,
                    boxShadow: `0 0 32px -6px ${ringColor}`,
                  }}
                />
                <div className="absolute inset-[10px] rounded-full bg-card" />
                <Gauge
                  className="relative h-7 w-7"
                  style={{ color: ringColor }}
                  aria-hidden="true"
                />
              </div>
            </div>
          </div>
        </ChartSection>

        <ChartSection
          id="viz-trend"
          title="Engagement Trend"
          description="Score and approval speed over time"
        >
          <ChartContainer
            config={trendConfig}
            className="max-h-[320px] w-full [&_.recharts-line-curve]:drop-shadow-[0_0_6px_hsl(var(--chart-2)/0.7)]"
          >
            <ComposedChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="vizTrendScoreFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 6" opacity={0.4} />
              <XAxis
                dataKey="month"
                tickFormatter={formatMonthTick}
                tickLine={false}
                axisLine={false}
              />
              <YAxis yAxisId="score" domain={[0, 100]} tickLine={false} axisLine={false} />
              <YAxis yAxisId="hours" orientation="right" tickLine={false} axisLine={false} />
              <ChartTooltip
                content={<ChartTooltipContent labelFormatter={(v) => formatMonthTick(String(v))} />}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Area
                yAxisId="score"
                type="monotone"
                dataKey="engagement_score"
                name="Engagement Score"
                stroke="var(--color-engagement_score)"
                fill="url(#vizTrendScoreFill)"
                strokeWidth={3}
                connectNulls
              />
              <Line
                yAxisId="hours"
                type="monotone"
                dataKey="avg_tta_hours"
                name="Avg TTA (hours)"
                stroke="var(--color-avg_tta_hours)"
                strokeWidth={2.5}
                strokeDasharray="6 3"
                dot={{
                  r: 3,
                  fill: "hsl(var(--card))",
                  stroke: "var(--color-avg_tta_hours)",
                  strokeWidth: 2,
                }}
                connectNulls
              />
            </ComposedChart>
          </ChartContainer>
        </ChartSection>

        <ChartSection
          id="viz-aging"
          title="Approval Aging"
          description="Decided requests by time-to-approve, by request type"
        >
          <ChartContainer config={agingConfig} className="max-h-[320px] w-full">
            <BarChart data={agingData} barGap={4} barCategoryGap="24%">
              <defs>
                <linearGradient id="vizAgingLeave" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={1} />
                  <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.5} />
                </linearGradient>
                <linearGradient id="vizAgingOvertime" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={1} />
                  <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0.5} />
                </linearGradient>
                <linearGradient id="vizAgingStandby" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-3))" stopOpacity={1} />
                  <stop offset="100%" stopColor="hsl(var(--chart-3))" stopOpacity={0.5} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 6" opacity={0.4} />
              <XAxis dataKey="bucket" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar
                dataKey="leave"
                fill="url(#vizAgingLeave)"
                radius={[8, 8, 2, 2]}
                maxBarSize={48}
              />
              <Bar
                dataKey="overtime"
                fill="url(#vizAgingOvertime)"
                radius={[8, 8, 2, 2]}
                maxBarSize={48}
              />
              <Bar
                dataKey="standby"
                fill="url(#vizAgingStandby)"
                radius={[8, 8, 2, 2]}
                maxBarSize={48}
              />
            </BarChart>
          </ChartContainer>
        </ChartSection>

        <ChartSection
          id="viz-score-composition"
          title="Score Composition Trend"
          description="Which component is driving the score, and since when"
        >
          <ScoreCompositionTrendChart data={trend} />
        </ChartSection>

        <ChartSection
          id="viz-volume"
          title="Request Volume"
          description="Approved, rejected, and pending, by request type"
        >
          <RequestVolumeChart rows={teamBreakdown} />
        </ChartSection>

        {teamBreakdown.length > 1 && (
          <ChartSection
            id="viz-team-comparison"
            title="Team Comparison"
            description="Engagement score by team"
          >
            <TeamComparisonChart rows={teamBreakdown} />
          </ChartSection>
        )}
      </motion.div>
    </PageShell>
  );
};
