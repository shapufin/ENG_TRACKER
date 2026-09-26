import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ArrowLeft, Download, LineChart as LineChartIcon, TriangleAlert } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { InfoCallout } from "@/components/ui/InfoCallout";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/visualization/chart";
import { ChartSection } from "@/components/visualization/ChartSection";
import { captureChartsToPdf } from "@/components/visualization/pdfExport";
import { useAuth } from "@/hooks/useAuth";
import { staggerContainer } from "@/lib/motion";
import { formatMonthTick } from "@/lib/monthOptions";
import { tlScorecardService } from "../services/tlScorecardService";

const leaveConfig: ChartConfig = {
  pct_within_2_days: { label: "Leave decided ≤2 days (%)", color: "hsl(var(--chart-1))" },
};

const overtimeConfig: ChartConfig = {
  avg_turnaround_days: { label: "OT approval turnaround (days)", color: "hsl(var(--chart-2))" },
};

const escalationConfig: ChartConfig = {
  escalation_count: { label: "Escalation risks", color: "hsl(var(--chart-3))" },
};

export const TLScorecardVisualizationPage: React.FC = () => {
  const trendQuery = useQuery({
    queryKey: ["tl-scorecard", "trend"],
    queryFn: async () => (await tlScorecardService.getTrend(6)).data,
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
        <div className="h-96 animate-pulse rounded-lg border bg-muted/40" />
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

  const leaveData = trend.map((p) => ({ month: p.month, pct_within_2_days: p.leave.pct_within_2_days }));
  const overtimeData = trend.map((p) => ({ month: p.month, avg_turnaround_days: p.overtime.avg_turnaround_days }));
  const escalationData = trend.map((p) => ({ month: p.month, escalation_count: p.escalation_count }));

  return (
    <PageShell
      title="TL Scorecard Visualization"
      subtitle="Trend charts across the last 6 months, for review and evidence"
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

        <ChartSection id="viz-leave-sla" title="Leave SLA" description="% of leave requests decided within 2 working days">
          <ChartContainer config={leaveConfig} className="max-h-[280px] w-full">
            <AreaChart data={leaveData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="vizLeaveFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 6" opacity={0.4} />
              <XAxis dataKey="month" tickFormatter={formatMonthTick} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => formatMonthTick(String(v))} />} />
              <Area
                type="monotone"
                dataKey="pct_within_2_days"
                stroke="var(--color-pct_within_2_days)"
                fill="url(#vizLeaveFill)"
                strokeWidth={3}
                connectNulls
              />
            </AreaChart>
          </ChartContainer>
        </ChartSection>

        <ChartSection id="viz-ot-turnaround" title="Overtime Turnaround" description="Average approval turnaround in business days">
          <ChartContainer config={overtimeConfig} className="max-h-[280px] w-full">
            <LineChart data={overtimeData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 6" opacity={0.4} />
              <XAxis dataKey="month" tickFormatter={formatMonthTick} tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => formatMonthTick(String(v))} />} />
              <Line
                type="monotone"
                dataKey="avg_turnaround_days"
                stroke="var(--color-avg_turnaround_days)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "hsl(var(--card))", stroke: "var(--color-avg_turnaround_days)", strokeWidth: 2 }}
                connectNulls
              />
            </LineChart>
          </ChartContainer>
        </ChartSection>

        <ChartSection id="viz-escalations" title="Escalation Risks" description="Computed live from breaches already tracked">
          <ChartContainer config={escalationConfig} className="max-h-[280px] w-full">
            <LineChart data={escalationData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 6" opacity={0.4} />
              <XAxis dataKey="month" tickFormatter={formatMonthTick} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => formatMonthTick(String(v))} />} />
              <Line
                type="monotone"
                dataKey="escalation_count"
                stroke="var(--color-escalation_count)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "hsl(var(--card))", stroke: "var(--color-escalation_count)", strokeWidth: 2 }}
                connectNulls
              />
            </LineChart>
          </ChartContainer>
        </ChartSection>
      </motion.div>
    </PageShell>
  );
};
