import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface TrendDataPoint {
  month: string;
  tickets: number;
  avgHours: number | null;
  /** Median and 90th-percentile resolution hours; absent on team charts. */
  p50?: number | null;
  p90?: number | null;
}

interface KPITrendChartProps {
  title: string;
  data: TrendDataPoint[];
  /** Kept for existing callers; the bars need no gradient. */
  gradientId?: string;
}

const MONTH_LABELS: Record<string, string> = {
  "01": "Jan",
  "02": "Feb",
  "03": "Mar",
  "04": "Apr",
  "05": "May",
  "06": "Jun",
  "07": "Jul",
  "08": "Aug",
  "09": "Sep",
  "10": "Oct",
  "11": "Nov",
  "12": "Dec",
};

const formatMonthTick = (value: string): string => {
  // "2026-05" → "May '26"
  const [year, month] = value.split("-");
  const label = MONTH_LABELS[month] ?? value;
  const shortYear = year ? `'${year.slice(-2)}` : "";
  return `${label} ${shortYear}`.trim();
};

const axisTick = { fill: "hsl(var(--muted-foreground))", fontSize: 12 };
const axisLine = { stroke: "hsl(var(--border))" };

const hasValue = (data: TrendDataPoint[], key: "p50" | "p90") =>
  data.some((d) => d[key] !== null && d[key] !== undefined);

/**
 * Tickets per month as bars (left axis) and resolution time as lines (right
 * axis, hours). The median and the 90th percentile are drawn when the data has
 * them: an average hides a few very slow tickets. Months without data are gaps,
 * not zeros. A text summary under the chart carries the same numbers.
 */
export const KPITrendChart: React.FC<KPITrendChartProps> = ({ title, data }) => {
  const showPercentiles = hasValue(data, "p50") || hasValue(data, "p90");
  const summary = data
    .map((d) => `${formatMonthTick(d.month)}: ${d.tickets} ticket${d.tickets === 1 ? "" : "s"}`)
    .join(", ");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="month"
                tickFormatter={formatMonthTick}
                tick={{ ...axisTick, fontSize: 11 }}
                interval="preserveStartEnd"
                minTickGap={16}
                axisLine={axisLine}
              />
              <YAxis
                yAxisId="left"
                width={32}
                tick={axisTick}
                axisLine={axisLine}
                allowDecimals={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                width={40}
                tick={axisTick}
                axisLine={axisLine}
                unit="h"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  borderColor: "hsl(var(--border))",
                  color: "hsl(var(--popover-foreground))",
                  borderRadius: "var(--radius)",
                }}
                labelFormatter={(label) => formatMonthTick(String(label))}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, color: "hsl(var(--foreground))" }}
                iconType="plainline"
              />
              <Bar
                yAxisId="left"
                dataKey="tickets"
                name="Tickets"
                fill="hsl(var(--chart-1))"
                fillOpacity={0.35}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
              {showPercentiles ? (
                <>
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="p50"
                    name="Median hours"
                    stroke="hsl(var(--chart-2))"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls={false}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="p90"
                    name="Slowest 10% hours"
                    stroke="hsl(var(--chart-3))"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={{ r: 3 }}
                    connectNulls={false}
                  />
                </>
              ) : (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="avgHours"
                  name="Average hours"
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="sr-only">{summary}</p>
      </CardContent>
    </Card>
  );
};
