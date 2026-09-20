import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";
import type { PendingTrendData } from "@/types";

interface PendingTrendCardProps {
  data?: PendingTrendData[];
}

export const PendingTrendCard: React.FC<PendingTrendCardProps> = ({ data = [] }) => {
  const chartData = data.map((point) => ({
    date: point.date,
    label: format(parseISO(point.date), "d MMM"),
    count: point.count,
  }));
  const hasData = chartData.some((point) => point.count > 0);

  return (
    <GlassCard>
      <div className="p-6 pb-0">
        <h3 className="text-xl font-semibold">Pending Trend</h3>
        <p className="text-muted-foreground">Team pending requests over the last 14 days</p>
      </div>
      {hasData ? (
        <div className="h-[220px] p-6">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorPendingTrend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                dy={10}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                dx={-10}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "12px",
                  color: "hsl(var(--card-foreground))",
                }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="hsl(var(--primary))"
                fillOpacity={1}
                fill="url(#colorPendingTrend)"
                strokeWidth={3}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="p-6 pt-4 text-sm text-muted-foreground">
          No pending trend data for the last 14 days.
        </p>
      )}
    </GlassCard>
  );
};
