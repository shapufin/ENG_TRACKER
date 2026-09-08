import React, { useState } from "react";
import { AreaChart, Area, BarChart, Bar, Legend, ResponsiveContainer, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartAxisGrid } from "@/pages/admin/components/ChartAxisGrid";
import type { AnalyticsTrends } from "./types";
import type { Period } from "@/pages/analytics/hooks/useAnalyticsPage";

interface AnalyticsTrendChartsProps {
  trends: AnalyticsTrends | undefined;
  period: Period;
}

const formatDateLabel = (dateStr: string, period: Period): string => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  if (period === "year") {
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const EmptyChartState: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex h-full min-h-[200px] items-center justify-center">
    <p className="text-sm text-muted-foreground">{message}</p>
  </div>
);

const ChartFrame: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div className="h-[280px] min-h-[220px] w-full min-w-0">{children}</div>
);

export const AnalyticsTrendCharts: React.FC<AnalyticsTrendChartsProps> = ({ trends, period }) => {
  // Merge overtime and standby into a single dataset keyed by date for the
  // combined Hours Trends chart.
  const otByDate = new Map<string, number>();
  for (const p of trends?.overtime ?? []) {
    otByDate.set(p.date, p.hours ?? 0);
  }
  const standbyByDate = new Map<string, number>();
  for (const p of trends?.standby ?? []) {
    standbyByDate.set(p.date, p.hours ?? 0);
  }
  const allDates = new Set([...otByDate.keys(), ...standbyByDate.keys()]);
  const hoursData = [...allDates].sort().map((date) => ({
    name: formatDateLabel(date, period),
    overtime: otByDate.get(date) ?? 0,
    standby: standbyByDate.get(date) ?? 0,
  }));

  const leaveData = (trends?.leave ?? []).map((p) => ({
    name: formatDateLabel(p.date, period),
    count: p.count ?? 0,
    approved: p.approved ?? 0,
    pending: p.pending ?? 0,
    rejected: p.rejected ?? 0,
  }));

  const userData = (trends?.user_activity ?? []).map((p) => ({
    name: formatDateLabel(p.date, period),
    new_users: p.new_users ?? 0,
    new_active: p.new_active ?? 0,
  }));

  const hasHoursData = hoursData.length > 0;
  const hasLeave = leaveData.length > 0;
  const hasUsers = userData.length > 0;

  const [leaveView, setLeaveView] = useState<"stacked" | "trend">("stacked");

  const leaveToggle = (
    <div className="flex gap-1">
      <Button
        size="sm"
        variant={leaveView === "stacked" ? "secondary" : "ghost"}
        className="h-7 px-2.5 text-xs"
        onClick={() => setLeaveView("stacked")}
      >
        Stacked
      </Button>
      <Button
        size="sm"
        variant={leaveView === "trend" ? "secondary" : "ghost"}
        className="h-7 px-2.5 text-xs"
        onClick={() => setLeaveView("trend")}
      >
        Trend
      </Button>
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Overtime & Standby Hours Trend — main chart, spans 2 columns */}
      <ChartCard
        title="Hours Trends"
        description="Overtime and standby hours over time"
        delay={0}
        className="lg:col-span-2"
      >
        {hasHoursData ? (
          <ChartFrame>
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart data={hoursData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad-overtime" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="grad-standby" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-5))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-5))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <ChartAxisGrid />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={36}
                  iconType="circle"
                  wrapperStyle={{ fontSize: 12, color: "hsl(var(--foreground))" }}
                />
                <Area
                  type="monotone"
                  dataKey="overtime"
                  name="Overtime"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  fill="url(#grad-overtime)"
                  fillOpacity={1}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
                <Area
                  type="monotone"
                  dataKey="standby"
                  name="Standby"
                  stroke="hsl(var(--chart-5))"
                  strokeWidth={2}
                  fill="url(#grad-standby)"
                  fillOpacity={1}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartFrame>
        ) : (
          <EmptyChartState message="No overtime or standby data for this period" />
        )}
      </ChartCard>

      {/* Leave Requests Trend — toggle between stacked bar and area trend */}
      <ChartCard
        title="Leave Requests"
        description="Requests over time, split by status"
        delay={0.1}
        className="lg:col-span-2"
        action={hasLeave ? leaveToggle : undefined}
      >
        {hasLeave ? (
          <ChartFrame>
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              {leaveView === "stacked" ? (
                <BarChart
                  data={leaveData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  barCategoryGap="20%"
                >
                  <defs>
                    <linearGradient id="grad-leave-approved" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0.6} />
                    </linearGradient>
                    <linearGradient id="grad-leave-pending" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--chart-3))" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="hsl(var(--chart-3))" stopOpacity={0.6} />
                    </linearGradient>
                    <linearGradient id="grad-leave-rejected" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0.6} />
                    </linearGradient>
                  </defs>
                  <ChartAxisGrid />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    height={36}
                    iconType="circle"
                    wrapperStyle={{ fontSize: 12, color: "hsl(var(--foreground))" }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "12px",
                      color: "hsl(var(--card-foreground))",
                      boxShadow: "0 10px 15px -3px rgba(0,0,0,0.5)",
                      fontSize: 12,
                    }}
                  />
                  <Bar
                    dataKey="approved"
                    name="Approved"
                    stackId="leave"
                    fill="url(#grad-leave-approved)"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="pending"
                    name="Pending"
                    stackId="leave"
                    fill="url(#grad-leave-pending)"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="rejected"
                    name="Rejected"
                    stackId="leave"
                    fill="url(#grad-leave-rejected)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              ) : (
                <AreaChart data={leaveData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="grad-leave-approved-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="grad-leave-pending-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="grad-leave-rejected-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <ChartAxisGrid />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    height={36}
                    iconType="circle"
                    wrapperStyle={{ fontSize: 12, color: "hsl(var(--foreground))" }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "12px",
                      color: "hsl(var(--card-foreground))",
                      boxShadow: "0 10px 15px -3px rgba(0,0,0,0.5)",
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="approved"
                    name="Approved"
                    stroke="hsl(var(--chart-2))"
                    strokeWidth={2}
                    fill="url(#grad-leave-approved-area)"
                    fillOpacity={1}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="pending"
                    name="Pending"
                    stroke="hsl(var(--chart-3))"
                    strokeWidth={2}
                    fill="url(#grad-leave-pending-area)"
                    fillOpacity={1}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="rejected"
                    name="Rejected"
                    stroke="hsl(var(--destructive))"
                    strokeWidth={2}
                    fill="url(#grad-leave-rejected-area)"
                    fillOpacity={1}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </ChartFrame>
        ) : (
          <EmptyChartState message="No leave data for this period" />
        )}
      </ChartCard>

      {/* User Growth */}
      <ChartCard
        title="User Growth"
        description="New users joining over time"
        delay={0.15}
        className="lg:col-span-2"
      >
        {hasUsers ? (
          <ChartFrame>
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart
                data={userData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                barCategoryGap="20%"
              >
                <ChartAxisGrid />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={36}
                  iconType="circle"
                  wrapperStyle={{ fontSize: 12, color: "hsl(var(--foreground))" }}
                />
                <Bar
                  dataKey="new_users"
                  name="New Users"
                  fill="hsl(var(--chart-2))"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="new_active"
                  name="New Active"
                  fill="hsl(var(--chart-1))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        ) : (
          <EmptyChartState message="No new users in this period" />
        )}
      </ChartCard>
    </div>
  );
};
