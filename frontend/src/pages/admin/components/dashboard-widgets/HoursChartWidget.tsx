/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { ChartCard } from "@/components/dashboard/ChartCard";
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
const chartTooltipStyle = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "var(--radius)",
  color: "hsl(var(--popover-foreground))",
  fontSize: 12,
};

interface HoursChartWidgetProps {
  hoursData: { label: string; hours: number }[];
  isLoading?: boolean;
}

const ChartSkeleton: React.FC = () => (
  <div className="flex h-full min-h-[220px] items-center justify-center">
    <div className="h-full w-full animate-pulse rounded-lg bg-muted/40" />
  </div>
);

export const HoursChartWidget: React.FC<HoursChartWidgetProps> = ({ hoursData, isLoading }) => (
  <ChartCard
    title="Hours Overview"
    description="Overtime vs Standby this month"
    delay={0.2}
    className="lg:col-span-2"
  >
    {isLoading ? (
      <ChartSkeleton />
    ) : (
      <div className="h-[280px] min-h-[220px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <BarChart data={hoursData} barSize={56}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip contentStyle={chartTooltipStyle} />
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
    )}
  </ChartCard>
);
