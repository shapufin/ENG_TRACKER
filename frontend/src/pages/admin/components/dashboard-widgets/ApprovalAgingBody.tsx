/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { CalendarClock } from "lucide-react";
import { WidgetBody } from "./WidgetBody";
import { chartTooltipStyle, axisTickStyle } from "./chartStyle";
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

interface ApprovalAgingBodyProps {
  data?: AdminOverview;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

/** "12.5" / "16": whole numbers stay whole, fractions keep one decimal. */
const fmt = (n: number) => String(Math.round(n * 10) / 10);

/** Pending backlog totals plus how long those requests have been waiting. */
export const ApprovalAgingBody: React.FC<ApprovalAgingBodyProps> = ({
  data,
  isLoading,
  isError,
  onRetry,
}) => {
  const aging = data?.approval_aging;
  const backlog = data?.pending_backlog;
  const rows = aging
    ? aging.buckets.map((bucket, i) => ({
        bucket,
        overtime: aging.overtime[i] ?? 0,
        standby: aging.standby[i] ?? 0,
        leave: aging.leave[i] ?? 0,
      }))
    : [];
  const total = rows.reduce((sum, r) => sum + r.overtime + r.standby + r.leave, 0);
  const oldest = rows[rows.length - 1];
  const oldCount = oldest ? oldest.overtime + oldest.standby + oldest.leave : 0;

  return (
    <WidgetBody
      title="Approval aging"
      isLoading={isLoading}
      isError={isError || (!isLoading && !data)}
      onRetry={onRetry}
      empty={total === 0 ? { icon: CalendarClock, title: "Nothing is waiting for approval" } : null}
    >
      <p className="text-muted-foreground mb-2 text-xs tabular-nums">
        {total} pending · {oldCount} waiting {oldest?.bucket ?? ""}
      </p>
      {backlog && (
        <ul className="mb-3 flex flex-wrap gap-1.5 text-xs">
          <li className="border-border bg-muted/50 rounded-md border px-2 py-0.5 tabular-nums">
            Overtime {backlog.overtime.count} · {fmt(backlog.overtime.hours)}h
          </li>
          <li className="border-border bg-muted/50 rounded-md border px-2 py-0.5 tabular-nums">
            Standby {backlog.standby.count} · {fmt(backlog.standby.hours)}h
          </li>
          <li className="border-border bg-muted/50 rounded-md border px-2 py-0.5 tabular-nums">
            Leave {backlog.leave.count} · {fmt(backlog.leave.days)}d
          </li>
        </ul>
      )}
      <div className="h-[200px] min-h-[160px] w-full min-w-0">
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
    </WidgetBody>
  );
};
