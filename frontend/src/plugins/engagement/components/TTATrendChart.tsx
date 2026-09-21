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
  const parts = value.split("-");
  if (parts.length < 2) return value;
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
  if (Number.isNaN(date.getTime())) return value;
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
      <div className="h-[280px] sm:h-[350px]">
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
              label={{ value: "Score", angle: -90, position: "insideLeft", fontSize: 11 }}
            />
            <YAxis
              yAxisId="hours"
              orientation="right"
              domain={[0, "auto"]}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              axisLine={{ stroke: "hsl(var(--border))" }}
              label={{ value: "Hours", angle: 90, position: "insideRight", fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                borderColor: "hsl(var(--border))",
                color: "hsl(var(--popover-foreground))",
                borderRadius: "8px",
              }}
              labelFormatter={(value) => formatMonthTick(String(value))}
              formatter={(value, name) => {
                if (name === "Avg TTA (hours)" && typeof value === "number") {
                  return [`${value.toFixed(1)} h`, name];
                }
                return [value, name];
              }}
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
        <table className="sr-only">
          <caption>Engagement trend data</caption>
          <tbody>
            {data.map((d) => (
              <tr key={d.month}>
                <th scope="row">{formatMonthTick(d.month)}</th>
                <td>Score {d.engagement_score ?? "no data"}</td>
                <td>Avg TTA {d.avg_tta_hours !== null ? `${d.avg_tta_hours} hours` : "no data"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </ChartCard>
);
