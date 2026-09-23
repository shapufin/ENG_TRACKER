import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { BarChart3 } from "lucide-react";
import type { EngagementTeamBreakdownRow } from "../types/engagement";

interface AgingBucketChartProps {
  rows: EngagementTeamBreakdownRow[];
}

const BUCKET_ORDER = ["<4h", "4-24h", "1-3d", ">3d"] as const;
const REQUEST_TYPES = ["leave", "overtime", "standby"] as const;

export const AgingBucketChart: React.FC<AgingBucketChartProps> = ({ rows }) => {
  const data = useMemo(() => {
    const totals: Record<
      (typeof BUCKET_ORDER)[number],
      Record<(typeof REQUEST_TYPES)[number], number>
    > = {
      "<4h": { leave: 0, overtime: 0, standby: 0 },
      "4-24h": { leave: 0, overtime: 0, standby: 0 },
      "1-3d": { leave: 0, overtime: 0, standby: 0 },
      ">3d": { leave: 0, overtime: 0, standby: 0 },
    };
    for (const row of rows) {
      for (const type of REQUEST_TYPES) {
        const aging = row.metrics[type]?.aging;
        if (!aging) continue;
        for (const bucket of BUCKET_ORDER) {
          totals[bucket][type] += aging[bucket] ?? 0;
        }
      }
    }
    return BUCKET_ORDER.map((bucket) => ({ bucket, ...totals[bucket] }));
  }, [rows]);

  const hasData = data.some((d) => d.leave + d.overtime + d.standby > 0);

  const dominant = useMemo(() => {
    if (!hasData) return null;
    const total = data.reduce((sum, d) => sum + d.leave + d.overtime + d.standby, 0);
    const best = data.reduce((max, d) =>
      d.leave + d.overtime + d.standby > max.leave + max.overtime + max.standby ? d : max
    );
    const count = best.leave + best.overtime + best.standby;
    return { bucket: best.bucket, pct: total ? Math.round((count / total) * 1000) / 10 : 0 };
  }, [data, hasData]);

  return (
    <ChartCard
      title="Approval Aging"
      description="Decided requests by time-to-approve"
      action={
        dominant ? (
          <span className="rounded-full bg-tone-success-surface px-2.5 py-0.5 text-xs font-semibold text-tone-success-text">
            {dominant.pct}% in {dominant.bucket}
          </span>
        ) : undefined
      }
    >
      {!hasData ? (
        <EmptyState
          icon={BarChart3}
          title="No decided requests yet"
          description="Aging buckets appear once requests have been approved or rejected."
        />
      ) : (
        <div className="h-[280px] sm:h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barGap={4} barCategoryGap="28%">
              <defs>
                <linearGradient id="agingLeaveFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={1} />
                  <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.55} />
                </linearGradient>
                <linearGradient id="agingOvertimeFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={1} />
                  <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0.55} />
                </linearGradient>
                <linearGradient id="agingStandbyFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-3))" stopOpacity={1} />
                  <stop offset="100%" stopColor="hsl(var(--chart-3))" stopOpacity={0.55} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="0" stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis
                dataKey="bucket"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  borderColor: "hsl(var(--border))",
                  color: "hsl(var(--popover-foreground))",
                  borderRadius: "8px",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="leave" name="Leave" fill="url(#agingLeaveFill)" radius={[6, 6, 1, 1]} maxBarSize={40} />
              <Bar
                dataKey="overtime"
                name="Overtime"
                fill="url(#agingOvertimeFill)"
                radius={[6, 6, 1, 1]}
                maxBarSize={40}
              />
              <Bar
                dataKey="standby"
                name="Standby"
                fill="url(#agingStandbyFill)"
                radius={[6, 6, 1, 1]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
};
