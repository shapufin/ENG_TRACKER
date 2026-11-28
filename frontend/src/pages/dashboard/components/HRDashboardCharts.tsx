import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { BarChart3 } from "lucide-react";
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
import { toneFillClass, type Tone } from "@/components/ui/tone";

interface MonthlyPoint {
  day: string;
  month?: string;
  overtime?: number;
  standby?: number;
}

interface StatusBar {
  label: string;
  value: number;
  tone?: Tone;
}

interface HRDashboardChartsProps {
  monthlyData: MonthlyPoint[];
  statusBars: StatusBar[];
}

export const HRDashboardCharts: React.FC<HRDashboardChartsProps> = ({
  monthlyData,
  statusBars,
}) => {
  // Every bar is a share of the same total, so the widths compare with each other.
  const total = statusBars.reduce((sum, bar) => sum + bar.value, 0);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <GlassCard className="lg:col-span-2" data-testid="hr-hours-chart">
        <div className="border-border/60 flex items-center justify-between border-b p-6">
          <div>
            <h3 className="text-foreground text-lg font-semibold">Approved Hours</h3>
            <p className="text-muted-foreground text-sm">
              Overtime and standby per month, company-wide
            </p>
          </div>
        </div>
        {(monthlyData ?? []).every((m) => !m.overtime && !m.standby) ? (
          <EmptyState
            icon={BarChart3}
            title="No approved hours for this period."
            description="The chart appears once overtime or standby is approved."
            className="m-6"
          />
        ) : (
          <div className="h-[350px] p-6">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData}>
                <defs>
                  <linearGradient id="colorOvertime" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorStandby" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
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
                    boxShadow: "var(--shadow-pop)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="overtime"
                  name="Overtime"
                  stroke="hsl(var(--primary))"
                  fillOpacity={1}
                  fill="url(#colorOvertime)"
                  strokeWidth={3}
                />
                <Area
                  type="monotone"
                  dataKey="standby"
                  name="Standby"
                  stroke="hsl(var(--chart-2))"
                  fillOpacity={1}
                  fill="url(#colorStandby)"
                  strokeWidth={3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </GlassCard>

      <GlassCard data-testid="hr-pipeline">
        <div className="border-border/60 flex items-center justify-between border-b p-6">
          <h3 className="text-foreground text-lg font-semibold">Request Pipeline</h3>
        </div>
        <div className="space-y-8 p-8">
          {statusBars.map((bar) => (
            <div key={bar.label} className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground font-medium tracking-wide">{bar.label}</span>
                <span className="text-foreground font-bold">{bar.value}</span>
              </div>
              <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
                <div
                  data-testid="hr-pipeline-fill"
                  className={cn(
                    "h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none",
                    toneFillClass[bar.tone ?? "neutral"]
                  )}
                  style={{
                    width: `${total > 0 ? Math.max(bar.value > 0 ? 1 : 0, Math.round((bar.value / total) * 100)) : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
};
