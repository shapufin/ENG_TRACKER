import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart,
  Area,
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
  avgHours: number;
}

interface KPITrendChartProps {
  title: string;
  data: TrendDataPoint[];
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

export const KPITrendChart: React.FC<KPITrendChartProps> = ({
  title,
  data,
  gradientId = "trendGrad",
}) => (
  <Card>
    <CardHeader>
      <CardTitle>{title}</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonthTick}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              angle={-35}
              textAnchor="end"
              height={60}
              interval={0}
              axisLine={{ stroke: "hsl(var(--border))" }}
            />
            <YAxis
              yAxisId="left"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              axisLine={{ stroke: "hsl(var(--border))" }}
            />
            <YAxis
              yAxisId="right"
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
            />
            <Legend
              wrapperStyle={{ fontSize: 12, color: "hsl(var(--foreground))" }}
              iconType="line"
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="tickets"
              name="Tickets"
              stroke="hsl(var(--chart-1))"
              fill={`url(#${gradientId})`}
            />
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="avgHours"
              name="Avg Hours"
              stroke="hsl(var(--chart-2))"
              fill="hsl(var(--chart-2))"
              fillOpacity={0.1}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </CardContent>
  </Card>
);
