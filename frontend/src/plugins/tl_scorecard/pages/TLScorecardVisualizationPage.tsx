import React, { useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  ComposedChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeft,
  CalendarCheck,
  ClipboardCheck,
  Download,
  LineChart as LineChartIcon,
  ShieldAlert,
  TrendingUp,
  TriangleAlert,
  Users,
} from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { InfoCallout } from "@/components/ui/InfoCallout";
import { StatCard } from "@/components/ui/StatCard";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/visualization/chart";
import { ChartSection } from "@/components/visualization/ChartSection";
import { usePermissions } from "@/context/PermissionContext";
import { useAuth } from "@/hooks/useAuth";
import { staggerContainer } from "@/lib/motion";
import { formatMonthTick } from "@/lib/monthOptions";
import type { Scorecard } from "../types/tlScorecard";
import { tlScorecardService } from "../services/tlScorecardService";

/** Pro-rata review target: a year's 12 reviews are due evenly, so by the end of
 * calendar month m the team should have delivered m of them. */
const REVIEW_TARGET_YEAR = 12;

const meetingCadenceConfig: ChartConfig = {
  team_meetings_held: { label: "Team meetings held", color: "hsl(var(--chart-1))" },
  team_meetings_with_hrbp: { label: "With HRBP", color: "hsl(var(--chart-2))" },
  tl_sync_count: { label: "TL syncs", color: "hsl(var(--chart-5))" },
};

const oneOnOneConfig: ChartConfig = {
  one_on_one: { label: "1:1 compliance (%)", color: "hsl(var(--chart-1))" },
};

const notesConfig: ChartConfig = {
  team_meetings_held: { label: "Team meetings held", color: "hsl(var(--chart-1))" },
  notes_within_24h: { label: "Notes within 24h", color: "hsl(var(--chart-2))" },
};

const reviewsConfig: ChartConfig = {
  review_deliveries_ytd: { label: "Reviews delivered (YTD)", color: "hsl(var(--chart-1))" },
  review_target: { label: "Pro-rata target", color: "hsl(var(--muted-foreground))" },
};

const eprConfig: ChartConfig = {
  pct_on_time: { label: "On time (%)", color: "hsl(var(--chart-1))" },
};

const riskConfig: ChartConfig = {
  value: { label: "Count", color: "hsl(var(--chart-1))" },
};

const seniorityConfig: ChartConfig = {
  junior: { label: "Junior", color: "hsl(var(--chart-1))" },
  mid: { label: "Mid", color: "hsl(var(--chart-2))" },
  senior: { label: "Senior", color: "hsl(var(--chart-5))" },
  unset: { label: "Unset", color: "hsl(var(--muted-foreground))" },
};

const CHART_MARGIN = { top: 8, right: 12, left: 0, bottom: 0 };
const CHART_CLASS = "aspect-auto h-56 w-full sm:h-72";
const TOOLTIP_CURSOR = { stroke: "hsl(var(--border))", strokeDasharray: "3 3" };

const monthTooltip = (
  <ChartTooltip
    cursor={TOOLTIP_CURSOR}
    content={<ChartTooltipContent labelFormatter={(v) => formatMonthTick(String(v))} />}
  />
);

const percentOrDash = (value: number | null) => (value === null ? "—" : `${value}%`);

const TLScorecardVisualization: React.FC = () => {
  const year = new Date().getFullYear();
  const trendQuery = useQuery({
    queryKey: ["tl-scorecard", "trend"],
    queryFn: async () => (await tlScorecardService.getTrend(6)).data,
  });
  const eprQuery = useQuery({
    queryKey: ["tl-scorecard", "epr-progress", year],
    queryFn: async () => (await tlScorecardService.getEprProgress(year)).data,
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  const handleExportPdf = async () => {
    if (!galleryRef.current) return;
    setIsExporting(true);
    setExportError(null);
    try {
      // Dynamic import: html2canvas + jspdf (via pdfExport) are a ~660KB
      // chunk (2026-09-27 audit) — only fetched when the user actually
      // exports, not on every visit to this page.
      const { captureChartsToPdf } = await import("@/components/visualization/pdfExport");
      const points = trendQuery.data ?? [];
      const periodLabel = points.length
        ? `${formatMonthTick(points[0].month)} – ${formatMonthTick(points[points.length - 1].month)}`
        : undefined;
      await captureChartsToPdf(galleryRef.current, {
        title: "TL Scorecard — Visual Report",
        filename: "tl-scorecard-visual.pdf",
        generatedBy: user?.full_name,
        periodLabel,
      });
    } catch {
      setExportError("Couldn't generate the PDF. Check your connection and try again.");
    } finally {
      setIsExporting(false);
    }
  };

  if (trendQuery.isLoading) {
    return (
      <PageShell title="TL Scorecard Visualization">
        <div className="bg-muted/40 h-96 animate-pulse rounded-lg border" />
      </PageShell>
    );
  }

  if (trendQuery.isError || !trendQuery.data) {
    return (
      <PageShell title="TL Scorecard Visualization">
        <ErrorCard
          title="Couldn't load visualization data"
          message="Check your connection and try again."
          onRetry={trendQuery.refetch}
        />
      </PageShell>
    );
  }

  const trend = trendQuery.data;
  if (trend.every((point) => point.team_size === 0)) {
    return (
      <PageShell title="TL Scorecard Visualization">
        <EmptyState
          icon={LineChartIcon}
          title="No team data yet"
          description="Charts appear here once your team has activity to compute a scorecard from."
        />
      </PageShell>
    );
  }

  const latest: Scorecard = trend[trend.length - 1];
  const cadenceData = trend.map((p) => ({
    month: p.month,
    team_meetings_held: p.meetings.team_meetings_held,
    team_meetings_with_hrbp: p.meetings.team_meetings_with_hrbp,
    tl_sync_count: p.meetings.tl_sync_count,
  }));
  const oneOnOneData = trend.map((p) => ({
    month: p.month,
    one_on_one: p.meetings.one_on_one_compliance_pct,
  }));
  const hasOneOnOne = oneOnOneData.some((d) => d.one_on_one !== null);
  const notesData = trend.map((p) => ({
    month: p.month,
    team_meetings_held: p.meetings.team_meetings_held,
    notes_within_24h: p.meetings.team_meeting_notes_within_24h,
  }));
  const reviewsData = trend.map((p) => ({
    month: p.month,
    review_deliveries_ytd: p.review_deliveries_ytd,
    // Calendar month number (1-12) times 12 / 12 = the pro-rata share due by month end.
    review_target: (REVIEW_TARGET_YEAR * Number(p.month.slice(5, 7))) / REVIEW_TARGET_YEAR,
  }));
  const eprStages = eprQuery.data
    ? [
        { stage: "Goal setting", pct_on_time: eprQuery.data.stages.goal_setting.pct_on_time },
        { stage: "Mid-year", pct_on_time: eprQuery.data.stages.mid_year.pct_on_time },
        { stage: "Final review", pct_on_time: eprQuery.data.stages.final_review.pct_on_time },
      ]
    : null;
  const riskData = [
    { label: "Active PIPs", value: latest.pip.active_count, tone: "default" },
    { label: "PIPs awaiting approval", value: latest.pip.pending_approval_count, tone: "default" },
    { label: "Open idle flags", value: latest.idle.open_count, tone: "default" },
    { label: "Open absences", value: latest.absences.open_count, tone: "default" },
    { label: "Absences past 5-day SLA", value: latest.absences.breached_5_day_sla, tone: "danger" },
    { label: "Escalation risks", value: latest.escalation_count, tone: "danger" },
  ];
  const seniorityData = [
    { name: "junior", label: "Junior", value: latest.seniority.junior },
    { name: "mid", label: "Mid", value: latest.seniority.mid },
    { name: "senior", label: "Senior", value: latest.seniority.senior },
    { name: "unset", label: "Unset", value: latest.seniority.unset },
  ];
  const seniorityTotal = seniorityData.reduce((sum, row) => sum + row.value, 0);
  const seniorityColors = [
    "hsl(var(--chart-1))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-5))",
    "hsl(var(--muted-foreground))",
  ];

  return (
    <PageShell
      title="TL Scorecard Visualization"
      subtitle="Governance charts across the last 6 months, for review and evidence"
      actions={
        <>
          <Button variant="outline" size="sm" asChild>
            <Link to="/tl-scorecard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to scorecard
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={isExporting}>
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? "Exporting…" : "Export PDF"}
          </Button>
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

        <ChartSection id="viz-kpis" title="This month at a glance">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {latest.meetings.one_on_one_compliance_pct !== null && (
              <StatCard
                label="1:1 compliance"
                value={`${latest.meetings.one_on_one_compliance_pct}%`}
                icon={CalendarCheck}
                iconTone="info"
              />
            )}
            <StatCard
              label="Team meetings held"
              value={latest.meetings.team_meetings_held}
              icon={Users}
              iconTone="accent"
              footer={`${latest.meetings.team_meetings_with_hrbp} with HRBP`}
            />
            <StatCard
              label="Reviews delivered YTD"
              value={`${latest.review_deliveries_ytd} / ${REVIEW_TARGET_YEAR}`}
              icon={ClipboardCheck}
              iconTone="success"
              progressPercent={Math.min(
                100,
                Math.round((latest.review_deliveries_ytd / REVIEW_TARGET_YEAR) * 100)
              )}
            />
            <StatCard
              label="Promotion rate"
              value={percentOrDash(latest.promotion.promoted_pct)}
              icon={TrendingUp}
              iconTone="warning"
              trend={`Target ${latest.promotion.target_pct}%`}
            />
          </div>
        </ChartSection>

        <ChartSection
          id="viz-meeting-cadence"
          title="Meeting cadence"
          description="Team meetings held, of which with HRBP, and TL syncs, per month"
        >
          <ChartContainer config={meetingCadenceConfig} className={CHART_CLASS}>
            <BarChart data={cadenceData} margin={CHART_MARGIN}>
              <CartesianGrid vertical={false} strokeDasharray="3 6" opacity={0.4} />
              <XAxis
                dataKey="month"
                tickFormatter={formatMonthTick}
                tickLine={false}
                axisLine={false}
              />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              {monthTooltip}
              <ChartLegend content={<ChartLegendContent />} />
              <Bar
                dataKey="team_meetings_held"
                fill="var(--color-team_meetings_held)"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="team_meetings_with_hrbp"
                fill="var(--color-team_meetings_with_hrbp)"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="tl_sync_count"
                fill="var(--color-tl_sync_count)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </ChartSection>

        {hasOneOnOne && (
          <ChartSection
            id="viz-one-on-one"
            title="1:1 compliance"
            description="Share of planned employee one-on-ones held, with the 100% target"
          >
            <ChartContainer config={oneOnOneConfig} className={CHART_CLASS}>
              <AreaChart data={oneOnOneData} margin={CHART_MARGIN}>
                <defs>
                  <linearGradient id="vizOneOnOneFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} />
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
                <YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
                {monthTooltip}
                <ReferenceLine
                  y={100}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 4"
                />
                <Area
                  type="monotone"
                  dataKey="one_on_one"
                  stroke="var(--color-one_on_one)"
                  fill="url(#vizOneOnOneFill)"
                  strokeWidth={3}
                  connectNulls
                />
              </AreaChart>
            </ChartContainer>
          </ChartSection>
        )}

        <ChartSection
          id="viz-notes-24h"
          title="Meeting notes within 24h"
          description="Team meetings held (bars) against notes recorded within 24 hours (line)"
        >
          <ChartContainer config={notesConfig} className={CHART_CLASS}>
            <ComposedChart data={notesData} margin={CHART_MARGIN}>
              <CartesianGrid vertical={false} strokeDasharray="3 6" opacity={0.4} />
              <XAxis
                dataKey="month"
                tickFormatter={formatMonthTick}
                tickLine={false}
                axisLine={false}
              />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              {monthTooltip}
              <ChartLegend content={<ChartLegendContent />} />
              <Bar
                dataKey="team_meetings_held"
                fill="var(--color-team_meetings_held)"
                radius={[4, 4, 0, 0]}
              />
              <Line
                type="monotone"
                dataKey="notes_within_24h"
                stroke="var(--color-notes_within_24h)"
                strokeWidth={2.5}
                connectNulls
              />
            </ComposedChart>
          </ChartContainer>
        </ChartSection>

        <ChartSection
          id="viz-reviews"
          title="Review deliveries vs target"
          description="Cumulative reviews delivered this year against the pro-rata target"
        >
          <ChartContainer config={reviewsConfig} className={CHART_CLASS}>
            <LineChart data={reviewsData} margin={CHART_MARGIN}>
              <CartesianGrid vertical={false} strokeDasharray="3 6" opacity={0.4} />
              <XAxis
                dataKey="month"
                tickFormatter={formatMonthTick}
                tickLine={false}
                axisLine={false}
              />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              {monthTooltip}
              <ChartLegend content={<ChartLegendContent />} />
              <Line
                type="monotone"
                dataKey="review_deliveries_ytd"
                stroke="var(--color-review_deliveries_ytd)"
                strokeWidth={3}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="review_target"
                stroke="var(--color-review_target)"
                strokeDasharray="4 4"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </ChartSection>

        {eprQuery.isError && (
          <ChartSection
            id="viz-epr"
            title={`EPR stage progress (${year})`}
            description="Share of team EPR stages completed by their due date"
          >
            <ErrorCard
              title="Couldn't load EPR progress"
              message="Check your connection and try again."
              onRetry={eprQuery.refetch}
            />
          </ChartSection>
        )}

        {eprStages && (
          <ChartSection
            id="viz-epr"
            title={`EPR stage progress (${year})`}
            description="Share of team EPR stages completed by their due date"
          >
            <ChartContainer config={eprConfig} className={CHART_CLASS}>
              <BarChart data={eprStages} layout="vertical" margin={CHART_MARGIN}>
                <CartesianGrid horizontal={false} strokeDasharray="3 6" opacity={0.4} />
                <XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} />
                <YAxis
                  type="category"
                  dataKey="stage"
                  width={110}
                  tickLine={false}
                  axisLine={false}
                />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Bar dataKey="pct_on_time" fill="var(--color-pct_on_time)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
            <div className="text-muted-foreground mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs">
              <span>Cycles started: {eprQuery.data?.cycles_started ?? 0}</span>
              <span>Cycles with 5+ goals: {eprQuery.data?.cycles_with_5plus_goals ?? 0}</span>
            </div>
          </ChartSection>
        )}

        <ChartSection
          id="viz-risk"
          title="Team risk snapshot (now)"
          description="Current state, not a trend"
          action={<ShieldAlert className="text-muted-foreground h-4 w-4" aria-hidden="true" />}
        >
          <ChartContainer config={riskConfig} className={CHART_CLASS}>
            <BarChart data={riskData} layout="vertical" margin={CHART_MARGIN}>
              <CartesianGrid horizontal={false} strokeDasharray="3 6" opacity={0.4} />
              <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
              <YAxis
                type="category"
                dataKey="label"
                width={140}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {riskData.map((row) => (
                  <Cell
                    key={row.label}
                    fill={row.tone === "danger" ? "hsl(var(--destructive))" : "hsl(var(--chart-1))"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartSection>

        <ChartSection
          id="viz-seniority"
          title="Seniority mix"
          description="Team members by seniority level, current state"
        >
          <div className="relative">
            <ChartContainer config={seniorityConfig} className={CHART_CLASS}>
              <PieChart margin={CHART_MARGIN}>
                <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                <Pie
                  data={seniorityData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="58%"
                  outerRadius="80%"
                  strokeWidth={2}
                >
                  {seniorityData.map((row, index) => (
                    <Cell key={row.name} fill={seniorityColors[index]} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-foreground text-2xl font-semibold tabular-nums">
                {seniorityTotal}
              </span>
              <span className="text-muted-foreground text-xs">people</span>
            </div>
          </div>
          <ul className="text-muted-foreground mt-4 flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs">
            {seniorityData.map((row, index) => (
              <li key={row.name} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: seniorityColors[index] }}
                />
                {row.label}: <span className="text-foreground tabular-nums">{row.value}</span>
              </li>
            ))}
          </ul>
        </ChartSection>
      </motion.div>
    </PageShell>
  );
};

/**
 * An HBPR-only viewer has no team of their own, so every trend call would 400
 * ("leader_id is required"). Send them to their own workspace instead of a raw
 * error card.
 */
export const TLScorecardVisualizationPage: React.FC = () => {
  const { isHBPROnly } = usePermissions();
  if (isHBPROnly) return <Navigate to="/hbpr" replace />;
  return <TLScorecardVisualization />;
};
