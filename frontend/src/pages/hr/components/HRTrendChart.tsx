import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface TrendItem {
  month?: string;
  year?: string;
  overtime?: number;
  standby?: number;
  leave?: number;
}

interface HRTrendChartProps {
  data: TrendItem[];
}

export const HRTrendChart: React.FC<HRTrendChartProps> = ({ data }) => (
  <GlassCard className="p-6">
    <CardHeader className="pb-4">
      <CardTitle className="text-base">Trend Snapshot</CardTitle>
    </CardHeader>
    <CardContent>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
            axisLine={{ stroke: "hsl(var(--border))" }}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
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
          <Area
            type="monotone"
            dataKey="overtime"
            stackId="1"
            stroke="hsl(var(--chart-1))"
            fill="hsl(var(--chart-1))"
            fillOpacity={0.6}
            name="OT"
          />
          <Area
            type="monotone"
            dataKey="standby"
            stackId="1"
            stroke="hsl(var(--chart-3))"
            fill="hsl(var(--chart-3))"
            fillOpacity={0.6}
            name="Standby"
          />
          <Area
            type="monotone"
            dataKey="leave"
            stackId="1"
            stroke="hsl(var(--chart-2))"
            fill="hsl(var(--chart-2))"
            fillOpacity={0.6}
            name="Leave"
          />
        </AreaChart>
      </ResponsiveContainer>
    </CardContent>
  </GlassCard>
);
