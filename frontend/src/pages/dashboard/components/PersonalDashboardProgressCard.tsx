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
  round2(logs.reduce((total, log) => total + Number(log.hours), 0));

/**
 * Summary aggregates arrive as Decimal strings ("0.00") while log entries
 * arrive as ints — coerce and trim so tiles never render "0.00h".
 */
const formatHours = (value: number | string) => {
  const num = Number(value);
  return String(Number.isFinite(num) ? round2(num) : 0);
};

const MetricTile: React.FC<{
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: Tone;
  footer: React.ReactNode;
}> = ({ label, value, icon, tone, footer }) => (
  <div className="border-border bg-card hover:border-border-focus/60 flex flex-col justify-between rounded-xl border p-3.5 transition-colors">
    <div>
      <div className="flex items-start justify-between gap-2">
        <span className="text-muted-foreground text-xs leading-tight font-bold tracking-wider uppercase">
          {label}
        </span>
        <IconWell tone={tone} size="sm">
          {icon}
        </IconWell>
      </div>
      <div className="mt-2 font-mono text-xl font-bold tracking-tight tabular-nums">{value}</div>
    </div>
    <div className="border-border mt-2.5 border-t pt-2">{footer}</div>
  </div>
);

const MagnitudeBar: React.FC<{ percent: number; caption: string }> = ({ percent, caption }) => (
  <div>
    <div className="bg-line-subtle h-1.5 w-full overflow-hidden rounded-full">
      <div
        data-testid="metric-tile-progress-fill"
        className="bg-primary h-full rounded-full"
        style={{ width: `${Math.round(Math.min(100, Math.max(0, percent)))}%` }}
      />
    </div>
    <p className="text-muted-foreground mt-1.5 text-xs font-medium">{caption}</p>
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
        <span className="text-xl font-bold tracking-tight tabular-nums">
          {Math.round(clamped)}%
        </span>
        <span className="text-muted-foreground text-xs font-bold tracking-widest uppercase">
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
  // pill instead of a bar.) Coerced once: summaries arrive as Decimal strings.
  const overtimeHours = Number(personalOvertimeHours) || 0;
  const standbyHours = Number(personalStandbyHours) || 0;
  const maxTileValue = Math.max(overtimeHours, standbyHours, 1);

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
            <span aria-hidden="true" className="bg-success h-1.5 w-1.5 rounded-full" />
            On track
          </Badge>
        )
      }
      controls={
        onWeekOffsetChange && (
          <div
            role="group"
            aria-label="Week period"
            className="border-border bg-card flex items-center gap-1 rounded-lg border p-0.5"
          >
            <CalendarDays className="text-muted-foreground ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
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
        <div className="border-border bg-card flex flex-col justify-between rounded-xl border p-3.5 lg:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
              Leave Utilization
            </span>
            <Badge variant="warning">Target: 100%</Badge>
          </div>
          <LeaveGauge progress={leaveProgress} />
          <div className="border-border flex items-center justify-between border-t pt-2 text-xs">
            {allowanceTotal !== undefined && allowanceTotal > 0 ? (
              <>
                <span className="text-muted-foreground font-medium">Days Utilized</span>
                <span className="font-bold">
                  <span>{leaveUsedDays}</span>{" "}
                  <span className="text-muted-foreground font-normal">/ {allowanceTotal} Days</span>
                </span>
              </>
            ) : (
              <span className="text-muted-foreground font-medium">No leave allowance set</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:col-span-7">
          {/* Overtime has no target to work toward — it's logged as needed, not
              budgeted against a quota — so it shares the same relative-magnitude
              tile treatment as standby, not a completion bar. */}
          <MetricTile
            label="Overtime Hours"
            value={`${formatHours(overtimeHours)}h`}
            icon={<Clock className="h-4 w-4" />}
            tone="warning"
            footer={
              <MagnitudeBar
                percent={(overtimeHours / maxTileValue) * 100}
                caption={`${weekOvertimeSum}h ${weekLabel}`}
              />
            }
          />
          <MetricTile
            label="Standby Hours"
            value={`${formatHours(standbyHours)}h`}
            icon={<Activity className="h-4 w-4" />}
            tone="info"
            footer={
              <MagnitudeBar
                percent={(standbyHours / maxTileValue) * 100}
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
                <Badge variant="warning" className="text-xs">
                  {`${pendingLeaveDays}d awaiting approval`}
                </Badge>
              ) : (
                <Badge variant="success" className="text-xs">
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
              <Bar
                dataKey="overtime"
                name="Overtime"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="standby"
                name="Standby"
                fill="hsl(var(--success))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-muted-foreground mt-4 text-sm" data-testid="weekly-hours-chart-empty">
          {`No overtime or standby hours logged ${weekLabel}.`}
        </p>
      )}

      <div
        className={cn(
          "border-border bg-muted/40 -mx-5 mt-2 -mb-5 flex flex-col gap-3 border-t px-5 py-3",
          "sm:flex-row sm:items-center sm:justify-between"
        )}
      >
        <p className="text-muted-foreground text-xs font-medium">
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
