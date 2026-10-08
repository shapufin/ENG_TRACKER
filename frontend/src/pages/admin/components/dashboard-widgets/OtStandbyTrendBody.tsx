import React from "react";
import { useReducedMotion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { axisTickStyle, chartTooltipStyle, fmt1, monthLabel } from "./chartStyle";
import { WidgetBody } from "./WidgetBody";
import type { TrendWidgetProps } from "./trendTypes";

export const OtStandbyTrendBody: React.FC<TrendWidgetProps> = ({
  data,
  isLoading,
  isError,
  onRetry,
}) => {
  const reduce = useReducedMotion();
  const rows = data
    ? data.months.map((m, i) => ({
        month: monthLabel(m),
        overtime: data.hours.overtime[i] ?? 0,
        standby: data.hours.standby[i] ?? 0,
        pending: data.hours.pending_overtime[i] ?? 0,
      }))
    : [];
  const total = rows.reduce((s, r) => s + r.overtime + r.standby + r.pending, 0);
  const last = rows[rows.length - 1];
  return (
    <WidgetBody
      title="Overtime & standby trend"
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      empty={
        total === 0
          ? {
              icon: TrendingUp,
              title: "No hours yet",
              description: "Approved overtime and standby will chart here.",
            }
          : null
      }
    >
      <p className="text-muted-foreground mb-2 text-xs">
        {`Approved hours per month, last ${rows.length || 12} months`}
      </p>
      <div
        role="img"
        aria-label={`Overtime and standby hours for the last ${rows.length || 12} months. Latest month: ${fmt1(last?.overtime ?? 0)} hours overtime, ${fmt1(last?.standby ?? 0)} hours standby.`}
        className="h-[240px] w-full min-w-0"
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="month" tick={axisTickStyle} tickLine={false} />
            <YAxis
              tick={axisTickStyle}
              tickLine={false}
              axisLine={false}
              width={36}
              tickFormatter={(v: number) => `${v}h`}
            />
            <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [`${fmt1(Number(v))}h`]} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="linear"
              dataKey="overtime"
              name="Overtime"
              stroke="hsl(var(--chart-1))"
              strokeWidth={2}
              dot={{ r: 2 }}
              isAnimationActive={!reduce}
            />
            <Line
              type="linear"
              dataKey="standby"
              name="Standby"
              stroke="hsl(var(--chart-2))"
              strokeWidth={2}
              dot={{ r: 2 }}
              isAnimationActive={!reduce}
            />
            <Line
              type="linear"
              dataKey="pending"
              name="Pending overtime"
              stroke="hsl(var(--chart-3))"
              strokeWidth={2}
              strokeDasharray="4 3"
              dot={{ r: 2 }}
              isAnimationActive={!reduce}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </WidgetBody>
  );
};
