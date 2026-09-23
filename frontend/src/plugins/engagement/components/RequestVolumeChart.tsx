import React, { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/ui/EmptyState";
import { BarChart3 } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/visualization/chart";
import type { EngagementTeamBreakdownRow } from "../types/engagement";

interface RequestVolumeChartProps {
  rows: EngagementTeamBreakdownRow[];
}

const REQUEST_TYPES = ["leave", "overtime", "standby"] as const;
const TYPE_LABELS: Record<(typeof REQUEST_TYPES)[number], string> = {
  leave: "Leave",
  overtime: "Overtime",
  standby: "Standby",
};

const config: ChartConfig = {
  approved: { label: "Approved", color: "hsl(var(--chart-2))" },
  rejected: { label: "Rejected", color: "hsl(var(--chart-4))" },
  pending: { label: "Pending", color: "hsl(var(--chart-3))" },
};

/** Submitted/approved/rejected volume per request type, aggregated across all
 * of a leader's teams for the selected month — the `submitted`/`approved`/
 * `rejected` counts already returned by `team-breakdown` were previously
 * only used to derive the aging buckets, never charted directly. */
export const RequestVolumeChart: React.FC<RequestVolumeChartProps> = ({ rows }) => {
  const data = useMemo(
    () =>
      REQUEST_TYPES.map((type) => {
        const totals = rows.reduce(
          (acc, row) => {
            const m = row.metrics[type];
            if (!m) return acc;
            acc.approved += m.approved ?? 0;
            acc.rejected += m.rejected ?? 0;
            acc.pending += Math.max(0, (m.submitted ?? 0) - (m.decided ?? 0));
            return acc;
          },
          { approved: 0, rejected: 0, pending: 0 }
        );
        return { type: TYPE_LABELS[type], ...totals };
      }),
    [rows]
  );

  const hasData = data.some((d) => d.approved + d.rejected + d.pending > 0);

  if (!hasData) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No requests yet"
        description="Volume by type appears once your team submits leave, overtime, or standby requests."
      />
    );
  }

  return (
    <ChartContainer config={config} className="max-h-[320px] w-full">
      <BarChart data={data} barGap={4} barCategoryGap="28%">
        <CartesianGrid vertical={false} strokeDasharray="3 6" opacity={0.4} />
        <XAxis dataKey="type" tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="approved" fill="var(--color-approved)" radius={[6, 6, 1, 1]} maxBarSize={40} />
        <Bar dataKey="rejected" fill="var(--color-rejected)" radius={[6, 6, 1, 1]} maxBarSize={40} />
        <Bar dataKey="pending" fill="var(--color-pending)" radius={[6, 6, 1, 1]} maxBarSize={40} />
      </BarChart>
    </ChartContainer>
  );
};
