/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { ChartCard } from "@/components/dashboard/ChartCard";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { AdminOverview } from "@/types";

const SERIES = [
  { key: "overtime", label: "Overtime", color: "hsl(var(--chart-1))" },
  { key: "standby", label: "Standby", color: "hsl(var(--chart-2))" },
  { key: "leave", label: "Leave", color: "hsl(var(--chart-3))" },
] as const;

const chartTooltipStyle = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "var(--radius)",
  color: "hsl(var(--popover-foreground))",
  fontSize: 12,
};
const axisTickStyle = { fontSize: 12, fill: "hsl(var(--muted-foreground))" };

interface ApprovalAgingWidgetProps {
  aging: AdminOverview["approval_aging"];
}

export const ApprovalAgingWidget: React.FC<ApprovalAgingWidgetProps> = ({ aging }) => {
  const rows = aging.buckets.map((bucket, i) => ({
    bucket,
    overtime: aging.overtime[i] ?? 0,
    standby: aging.standby[i] ?? 0,
    leave: aging.leave[i] ?? 0,
  }));
  const total = rows.reduce((sum, r) => sum + r.overtime + r.standby + r.leave, 0);
  const oldest = rows[rows.length - 1];
  const oldCount = oldest ? oldest.overtime + oldest.standby + oldest.leave : 0;

  return (
    <ChartCard
      sectionId="approval-aging"
      title="Approval Aging"
      description={
        total === 0
          ? "Nothing is waiting for approval"
          : `${total} pending · ${oldCount} waiting ${oldest?.bucket ?? ""}`
      }
      delay={0.2}
      className="lg:col-span-2"
    >
      <div className="h-[240px] min-h-[200px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="bucket"
              tick={axisTickStyle}
              tickLine={false}
              axisLine={{ stroke: "hsl(var(--border))" }}
            />
            <YAxis
              tick={axisTickStyle}
              tickLine={false}
              axisLine={false}
              width={28}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
              contentStyle={chartTooltipStyle}
              formatter={(value: any, name: any) => [value, name]}
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            {SERIES.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} stackId="age" fill={s.color} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
};
