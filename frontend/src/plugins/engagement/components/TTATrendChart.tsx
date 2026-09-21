import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { TrendingUp } from "lucide-react";
import type { EngagementTrendPoint } from "../types/engagement";

interface TTATrendChartProps {
  data: EngagementTrendPoint[];
}

const formatMonthTick = (value: string): string => {
  const [year, month] = value.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
};

export const TTATrendChart: React.FC<TTATrendChartProps> = ({ data }) => (
  <ChartCard title="Engagement Trend" description="Score and approval speed over time">
    {data.length === 0 ? (
      <EmptyState
        icon={TrendingUp}
        title="No trend data yet"
        description="Snapshots build up month over month as metrics are computed."
      />
    ) : (
      <div className="h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonthTick}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              axisLine={{ stroke: "hsl(var(--border))" }}
            />
            <YAxis
              yAxisId="score"
              domain={[0, 100]}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              axisLine={{ stroke: "hsl(var(--border))" }}
            />
            <YAxis
              yAxisId="hours"
              orientation="right"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              axisLine={{ stroke: "hsl(var(--border))" }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                borderColor: "hsl(var(--border))",
                color: "hsl(var(--popover-foreground))",
                borderRadius: "8px",
              }}
              labelFormatter={(value) => formatMonthTick(String(value))}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, color: "hsl(var(--foreground))" }}
              iconType="line"
            />
            <Line
              yAxisId="score"
              type="monotone"
              dataKey="engagement_score"
              name="Engagement Score"
              stroke="hsl(var(--chart-1))"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
            <Line
              yAxisId="hours"
              type="monotone"
              dataKey="avg_tta_hours"
              name="Avg TTA (hours)"
              stroke="hsl(var(--chart-2))"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    )}
  </ChartCard>
);
