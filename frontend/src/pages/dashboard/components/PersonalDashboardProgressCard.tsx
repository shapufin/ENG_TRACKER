import React from "react";
import { Link } from "react-router-dom";
import { Activity, CalendarDays, Check, Clock, Plus } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { DashboardSectionShell } from "@/components/dashboard/DashboardSectionShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconWell, type Tone } from "@/components/ui/IconWell";
import { cn } from "@/lib/utils";
import { buildWeeklyHoursChartData, type WeeklyHoursPoint } from "../weeklyHoursChart";
import type { OvertimeLog, StandbyLog } from "@/types";

interface PersonalDashboardProgressCardProps {
  personalOvertimeHours: number;
  leaveProgress: number;
  personalStandbyHours: number;
  pendingLeaveDays: number;
  /** Real utilized/available day counts; the days footer is omitted without them. */
  leaveUsedDays?: number;
  leaveAvailableDays?: number;
  weekOvertimeLogs?: Pick<OvertimeLog, "date" | "hours">[];
  weekStandbyLogs?: Pick<StandbyLog, "date" | "hours">[];
  /** ISO end date of the selected rolling window; the chart buckets from it. */
  weekReferenceDate?: string;
  /** 0 = this week, 1 = last week. Selector hidden when handler is absent. */
  weekOffset?: 0 | 1;
  onWeekOffsetChange?: (offset: 0 | 1) => void;
}

const RING_RADIUS = 42;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const round2 = (value: number) => Math.round(value * 100) / 100;
const sumHours = (logs: Pick<OvertimeLog, "date" | "hours">[]) =>
  round2(logs.reduce((total, log) => total + log.hours, 0));

const MetricTile: React.FC<{
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: Tone;
  footer: React.ReactNode;
}> = ({ label, value, icon, tone, footer }) => (
  <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-3.5 transition-colors hover:border-border-focus/60">
    <div>
      <div className="flex items-start justify-between gap-2">
        <span className="text-micro-lg font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <IconWell tone={tone} size="sm">
          {icon}
        </IconWell>
      </div>
      <div className="mt-2 font-mono text-xl font-bold tabular-nums tracking-tight">{value}</div>
    </div>
    <div className="mt-2.5 border-t border-border pt-2">{footer}</div>
  </div>
);

const MagnitudeBar: React.FC<{ percent: number; caption: string }> = ({ percent, caption }) => (
  <div>
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-input-bg">
      <div
        data-testid="metric-tile-progress-fill"
        className="h-full rounded-full bg-primary"
        style={{ width: `${Math.round(Math.min(100, Math.max(0, percent)))}%` }}
      />
    </div>
    <p className="mt-1.5 text-micro font-medium text-muted-foreground">{caption}</p>
  </div>
);

const LeaveGauge: React.FC<{ progress: number }> = ({ progress }) => {
  const clamped = Math.min(100, Math.max(0, progress));
  const arcOffset = RING_CIRCUMFERENCE * (1 - clamped / 100);
  return (
    <div
      className="relative mx-auto my-2 h-28 w-28"
      role="img"
      aria-label={`Leave utilization ${Math.round(clamped)}%`}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle
          cx="50"
          cy="50"
          r={RING_RADIUS}
          fill="transparent"
          stroke="hsl(var(--line-subtle))"
          strokeWidth="9"
        />
        <circle
          cx="50"
          cy="50"
          r={RING_RADIUS}
          fill="transparent"
          stroke="hsl(var(--warning))"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={arcOffset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-xl font-bold tabular-nums tracking-tight">
          {Math.round(clamped)}%
        </span>
        <span className="text-micro font-bold uppercase tracking-widest text-muted-foreground">
          Goal
        </span>
      </div>
    </div>
  );
};

export const PersonalDashboardProgressCard: React.FC<PersonalDashboardProgressCardProps> = ({
  personalOvertimeHours,
  leaveProgress,
  personalStandbyHours,
  pendingLeaveDays,
  leaveUsedDays,
  leaveAvailableDays,
  weekOvertimeLogs = [],
  weekStandbyLogs = [],
  weekReferenceDate,
  weekOffset = 0,
  onWeekOffsetChange,
}) => {
  const weekLabel = weekOffset === 1 ? "last week" : "this week";
  const weekOvertimeSum = sumHours(weekOvertimeLogs);
  const weekStandbySum = sumHours(weekStandbyLogs);

  // Tile bars show each total's size relative to the largest of the two hour
  // totals — there's no shared target across overtime and standby to measure
  // a "% of goal" against, so this is a relative-magnitude bar, not a
  // completion bar. (Pending leave is days, not hours, so it gets a status
  // pill instead of a bar.)
  const maxTileValue = Math.max(personalOvertimeHours, personalStandbyHours, 1);

  const allowanceTotal =
    leaveUsedDays !== undefined && leaveAvailableDays !== undefined
      ? leaveUsedDays + leaveAvailableDays
      : undefined;

  const parsedReference = weekReferenceDate ? new Date(`${weekReferenceDate}T12:00:00`) : null;
  const referenceNow =
    parsedReference && !Number.isNaN(parsedReference.getTime()) ? parsedReference : new Date();
  const weeklyData: WeeklyHoursPoint[] = buildWeeklyHoursChartData(
    weekOvertimeLogs,
    weekStandbyLogs,
    referenceNow
  );
  const hasWeeklyData = weeklyData.some((point) => point.overtime > 0 || point.standby > 0);

  return (
    <DashboardSectionShell
      title="Leave goal & hours"
      subtitle="My Progress & Weekly Allocation Overview"
      badge={
        pendingLeaveDays > 0 ? (
          <Badge variant="warning">{`${pendingLeaveDays}d pending approval`}</Badge>
        ) : (
          <Badge variant="success" className="gap-1.5">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
            On track
          </Badge>
        )
      }
      controls={
        onWeekOffsetChange && (
          <div
            role="group"
            aria-label="Week period"
            className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5"
          >
            <CalendarDays className="ml-1.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            {([0, 1] as const).map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={weekOffset === option ? "secondary" : "ghost"}
                aria-pressed={weekOffset === option}
                onClick={() => onWeekOffsetChange(option)}
                className="h-7 px-2.5 text-xs"
              >
                {option === 0 ? "This Week" : "Last Week"}
              </Button>
            ))}
          </div>
        )
      }
      bodyClassName="flex flex-col gap-4"
    >
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
        <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-3.5 lg:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-micro-lg font-bold uppercase tracking-wider text-muted-foreground">
              Leave Utilization
            </span>
            <Badge variant="warning">Target: 100%</Badge>
          </div>
          <LeaveGauge progress={leaveProgress} />
          <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
            {allowanceTotal !== undefined && allowanceTotal > 0 ? (
              <>
                <span className="font-medium text-muted-foreground">Days Utilized</span>
                <span className="font-bold">
                  <span>{leaveUsedDays}</span>{" "}
                  <span className="font-normal text-muted-foreground">
                    / {allowanceTotal} Days
                  </span>
                </span>
              </>
            ) : (
              <span className="font-medium text-muted-foreground">No leave allowance set</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:col-span-7">
          {/* Overtime has no target to work toward — it's logged as needed, not
              budgeted against a quota — so it shares the same relative-magnitude
              tile treatment as standby, not a completion bar. */}
          <MetricTile
            label="Overtime Hours"
            value={`${personalOvertimeHours}h`}
            icon={<Clock className="h-4 w-4" />}
            tone="warning"
            footer={
              <MagnitudeBar
                percent={(personalOvertimeHours / maxTileValue) * 100}
                caption={`${weekOvertimeSum}h ${weekLabel}`}
              />
            }
          />
          <MetricTile
            label="Standby Hours"
            value={`${personalStandbyHours}h`}
            icon={<Activity className="h-4 w-4" />}
            tone="info"
            footer={
              <MagnitudeBar
                percent={(personalStandbyHours / maxTileValue) * 100}
                caption={`${weekStandbySum}h ${weekLabel}`}
              />
            }
          />
          <MetricTile
            label="Pending Leave"
            value={`${pendingLeaveDays}d`}
            icon={<Check className="h-4 w-4" />}
            tone="success"
            footer={
              pendingLeaveDays > 0 ? (
                <Badge variant="warning" className="text-micro">
                  {`${pendingLeaveDays}d awaiting approval`}
                </Badge>
              ) : (
                <Badge variant="success" className="text-micro">
                  No pending requests
                </Badge>
              )
            }
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
          {`No overtime or standby hours logged ${weekLabel}.`}
        </p>
      )}

      <div
        className={cn(
          "-mx-5 -mb-5 mt-2 flex flex-col gap-3 border-t border-border bg-muted/40 px-5 py-3",
          "sm:flex-row sm:items-center sm:justify-between"
        )}
      >
        <p className="text-xs font-medium text-muted-foreground">
          {`${weekOvertimeSum}h overtime · ${weekStandbySum}h standby ${weekLabel}`}
        </p>
        <Button type="button" size="sm" asChild className="self-end sm:self-auto">
          <Link to="/overtime">
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Log Hours
          </Link>
        </Button>
      </div>
    </DashboardSectionShell>
  );
};
