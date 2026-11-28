import React, { useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Chip } from "@/components/ui/Chip";
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
  overtime?: number;
  standby?: number;
}

interface HRTrendChartProps {
  data: TrendItem[];
}

export const HRTrendChart: React.FC<HRTrendChartProps> = ({ data }) => {
  const [showStandby, setShowStandby] = useState(true);
  const [showOvertime, setShowOvertime] = useState(true);

  const toggleStandby = () => {
    if (showStandby && !showOvertime) return;
    setShowStandby((v) => !v);
  };
  const toggleOvertime = () => {
    if (showOvertime && !showStandby) return;
    setShowOvertime((v) => !v);
  };

  return (
    <GlassCard className="flex h-full flex-col p-5">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 p-0 pb-4">
        <div>
          <CardTitle className="text-base">Trend Snapshot</CardTitle>
          <p className="text-muted-foreground mt-0.5 text-xs">
            6-month approved Standby &amp; Overtime volume
          </p>
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label="Chart series">
          <Chip pressed={showStandby} onClick={toggleStandby}>
            Standby
          </Chip>
          <Chip pressed={showOvertime} onClick={toggleOvertime}>
            Overtime
          </Chip>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
              axisLine={{ stroke: "hsl(var(--border))" }}
              tickLine={false}
            />
            <YAxis
              unit="h"
              tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                borderColor: "hsl(var(--border))",
                color: "hsl(var(--popover-foreground))",
                borderRadius: "12px",
                boxShadow: "var(--shadow-pop)",
              }}
            />
            {showOvertime && (
              <Area
                type="monotone"
                dataKey="overtime"
                stackId="1"
                stroke="hsl(var(--chart-1))"
                fill="hsl(var(--chart-1))"
                fillOpacity={0.25}
                strokeWidth={2}
                name="Overtime"
              />
            )}
            {showStandby && (
              <Area
                type="monotone"
                dataKey="standby"
                stackId="1"
                stroke="hsl(var(--chart-3))"
                fill="hsl(var(--chart-3))"
                fillOpacity={0.25}
                strokeWidth={2}
                name="Standby"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </GlassCard>
  );
};
