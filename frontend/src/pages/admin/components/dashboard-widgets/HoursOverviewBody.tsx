/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { axisTickStyle, chartTooltipStyle } from "./chartStyle";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  LabelList,
} from "recharts";

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
];
interface HoursOverviewBodyProps {
  hoursData: { label: string; hours: number }[];
  isLoading?: boolean;
}

/** Overtime vs standby hours for the current month (stats data, no extra request). */
export const HoursOverviewBody: React.FC<HoursOverviewBodyProps> = ({ hoursData, isLoading }) =>
  isLoading ? (
    <div
      role="status"
      aria-label="Loading hours overview"
      className="bg-muted/40 h-[240px] w-full animate-pulse rounded-lg"
    />
  ) : (
    <div className="h-[240px] min-h-[200px] w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <BarChart data={hoursData} barSize={56} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            tick={axisTickStyle}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
          />
          <YAxis
            tick={axisTickStyle}
            tickLine={false}
            axisLine={false}
            width={36}
            tickFormatter={(value: number) => `${value}h`}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
            contentStyle={chartTooltipStyle}
            formatter={(value: any) => [`${Number(value).toFixed(1)}h`, "Hours"]}
          />
          <Bar dataKey="hours" radius={[6, 6, 0, 0]}>
            {hoursData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
            <LabelList
              dataKey="hours"
              position="top"
              formatter={(value: any) => `${Number(value).toFixed(1)}h`}
              style={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
