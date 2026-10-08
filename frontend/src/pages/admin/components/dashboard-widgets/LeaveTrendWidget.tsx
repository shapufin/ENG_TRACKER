import React from "react";
import { useReducedMotion } from "framer-motion";
import { CalendarDays } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { axisTickStyle, chartTooltipStyle, fmt1, monthLabel } from "./chartStyle";
import { WidgetFrame } from "./WidgetFrame";
import type { TrendWidgetProps } from "./trendTypes";

export const LeaveTrendWidget: React.FC<TrendWidgetProps> = ({
  data,
  isLoading,
  isError,
  onRetry,
}) => {
  const reduce = useReducedMotion();
  const rows = data
    ? data.months.map((m, i) => ({
        month: monthLabel(m),
        vacation: data.leave_days.vacation[i] ?? 0,
        sick: data.leave_days.sick[i] ?? 0,
      }))
    : [];
  const total = rows.reduce((s, r) => s + r.vacation + r.sick, 0);
  const last = rows[rows.length - 1];
  return (
    <WidgetFrame
      sectionId="leave-trend"
      title="Leave Trend"
      description="Approved business days per month"
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      empty={total === 0 ? { icon: CalendarDays, title: "No approved leave yet" } : null}
    >
      <div
        role="img"
        aria-label={`Approved leave in business days for the last ${rows.length || 12} months. Latest month: ${fmt1(last?.vacation ?? 0)} vacation, ${fmt1(last?.sick ?? 0)} sick.`}
        className="h-full min-h-[200px] w-full min-w-0"
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="month" tick={axisTickStyle} tickLine={false} />
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
              formatter={(v) => [`${fmt1(Number(v))}d`]}
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Bar
              dataKey="vacation"
              name="Vacation"
              stackId="leave"
              fill="hsl(var(--chart-2))"
              isAnimationActive={!reduce}
            />
            <Bar
              dataKey="sick"
              name="Sick"
              stackId="leave"
              fill="hsl(var(--chart-4))"
              isAnimationActive={!reduce}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </WidgetFrame>
  );
};
