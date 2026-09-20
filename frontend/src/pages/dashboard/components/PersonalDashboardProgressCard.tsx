import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { DashboardSectionShell } from "@/components/dashboard/DashboardSectionShell";
import { buildWeeklyHoursChartData, type WeeklyHoursPoint } from "../weeklyHoursChart";
import type { OvertimeLog, StandbyLog } from "@/types";

interface PersonalDashboardProgressCardProps {
  personalOvertimeHours: number;
  leaveProgress: number;
  personalStandbyHours: number;
  pendingLeaveDays: number;
  weekOvertimeLogs?: Pick<OvertimeLog, "date" | "hours">[];
  weekStandbyLogs?: Pick<StandbyLog, "date" | "hours">[];
}

const MetricTile: React.FC<{ label: string; value: string; percent: number }> = ({
  label,
  value,
  percent,
}) => (
  <div className="rounded-xl border border-border bg-muted/30 p-4">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="font-mono text-lg font-semibold tabular-nums">{value}</p>
    <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-input-bg">
      <div
        data-testid="metric-tile-progress-fill"
        className="h-full rounded-full bg-primary"
        style={{ width: `${Math.round(Math.min(100, Math.max(0, percent)))}%` }}
      />
    </div>
  </div>
);

export const PersonalDashboardProgressCard: React.FC<PersonalDashboardProgressCardProps> = ({
  personalOvertimeHours,
  leaveProgress,
  personalStandbyHours,
  pendingLeaveDays,
  weekOvertimeLogs = [],
  weekStandbyLogs = [],
}) => {
  const weeklyData: WeeklyHoursPoint[] = buildWeeklyHoursChartData(
    weekOvertimeLogs,
    weekStandbyLogs
  );
  const hasWeeklyData = weeklyData.some((point) => point.overtime > 0 || point.standby > 0);
  // Tile bars show each metric's size relative to the largest of the three —
  // there's no shared target across hours and days to measure a "% of goal"
  // against, so this is a relative-magnitude bar, not a completion bar.
  const maxTileValue = Math.max(personalOvertimeHours, personalStandbyHours, pendingLeaveDays, 1);
  const clampedLeaveProgress = Math.min(100, Math.max(0, leaveProgress));

  return (
    <DashboardSectionShell
      title="Leave goal & hours"
      subtitle="My Progress"
      bodyClassName="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-6 xl:flex-row xl:items-stretch">
        <div className="flex shrink-0 flex-col items-center justify-center rounded-2xl border border-border/60 bg-background/60 p-6 xl:w-48">
          <div
            className="relative flex h-32 w-32 items-center justify-center rounded-full"
            role="img"
            aria-label={`Leave utilization ${Math.round(clampedLeaveProgress)}%`}
          >
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(hsl(var(--warning)) ${clampedLeaveProgress * 3.6}deg, hsl(var(--muted)) ${clampedLeaveProgress * 3.6}deg)`,
              }}
            />
            <div className="absolute inset-[10px] rounded-full bg-background" />
            <div className="relative text-center">
              <div className="text-2xl font-bold tabular-nums">
                {Math.round(clampedLeaveProgress)}%
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Goal
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-xs uppercase tracking-[0.15em] text-muted-foreground">
            Leave Utilization
          </p>
        </div>

        <div className="grid flex-1 grid-cols-2 gap-4">
          {/* Overtime has no target to work toward — it's logged as needed, not
              budgeted against a quota — so it shares the same relative-magnitude
              tile treatment as standby/pending, not a completion bar. */}
          <MetricTile
            label="Overtime Hours"
            value={`${personalOvertimeHours}h`}
            percent={(personalOvertimeHours / maxTileValue) * 100}
          />
          <MetricTile
            label="Standby Hours"
            value={`${personalStandbyHours}h`}
            percent={(personalStandbyHours / maxTileValue) * 100}
          />
          <MetricTile
            label="Pending Leave"
            value={`${pendingLeaveDays}d`}
            percent={(pendingLeaveDays / maxTileValue) * 100}
          />
        </div>
      </div>

      {hasWeeklyData ? (
        <div className="mt-4 h-[180px]" data-testid="weekly-hours-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyData}>
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
              <Bar dataKey="overtime" name="Overtime" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="standby" name="Standby" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground" data-testid="weekly-hours-chart-empty">
          No overtime or standby hours logged this week.
        </p>
      )}
    </DashboardSectionShell>
  );
};
