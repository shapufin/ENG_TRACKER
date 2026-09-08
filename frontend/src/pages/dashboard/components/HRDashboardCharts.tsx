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
import { cn } from "@/lib/utils";

interface HRDashboardChartsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  monthlyData: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  statusBars: any[];
}

export const HRDashboardCharts: React.FC<HRDashboardChartsProps> = ({
  monthlyData,
  statusBars,
}) => (
  <div className="grid gap-6 lg:grid-cols-3">
    <GlassCard className="border-border/70 bg-card lg:col-span-2">
      <div className="flex items-center justify-between border-b border-border/70 p-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Overtime Distribution</h3>
          <p className="text-sm text-muted-foreground">Daily average hours across all teams</p>
        </div>
        <div className="h-2 w-24 overflow-hidden rounded-full bg-primary/20">
          <div className="h-full w-2/3 bg-primary" />
        </div>
      </div>
      <div className="h-[350px] p-6">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={monthlyData}>
            <defs>
              <linearGradient id="colorOvertime" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="day"
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
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "12px",
                color: "hsl(var(--card-foreground))",
                boxShadow: "0 10px 15px -3px rgba(0,0,0,0.5)",
              }}
            />
            <Area
              type="monotone"
              dataKey="overtime"
              stroke="hsl(var(--primary))"
              fillOpacity={1}
              fill="url(#colorOvertime)"
              strokeWidth={3}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>

    <GlassCard className="border-border/70 bg-card">
      <div className="flex items-center justify-between border-b border-border/70 p-6">
        <h3 className="text-lg font-semibold text-foreground">Request Pipeline</h3>
      </div>
      <div className="space-y-8 p-8">
        {statusBars.map((bar) => (
          <div key={bar.label} className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium tracking-wide text-muted-foreground">{bar.label}</span>
              <span className="font-bold text-foreground">{bar.value}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-1000",
                  bar.label === "Pending"
                    ? "bg-amber-500/80 shadow-[0_0_10px_rgba(245,158,11,0.2)]"
                    : bar.label === "Approved"
                      ? "bg-emerald-500/80 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                      : "bg-rose-500/80 shadow-[0_0_10px_rgba(239,68,68,0.2)]"
                )}
                style={{ width: `${Math.min(100, (bar.value / 20) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  </div>
);
