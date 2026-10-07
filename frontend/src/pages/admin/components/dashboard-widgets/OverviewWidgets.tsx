import React from "react";
import {
  AlertCircle,
  CalendarClock,
  CalendarDays,
  CheckCircle,
  Clock,
  HardDrive,
  Users,
} from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { GlassCard } from "@/components/ui/GlassCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { OVERVIEW_WIDGET_IDS } from "@/config/dashboardWidgets";
import type { AdminOverview } from "@/types";
import { ApprovalAgingWidget } from "./ApprovalAgingWidget";

interface OverviewWidgetsProps {
  isWidgetActive: (id: string) => boolean;
  data?: AdminOverview;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  isSuperuser: boolean;
}

/** Whole numbers stay whole, fractions keep one decimal (12.5, 16). */
const fmt = (n: number) => String(Math.round(n * 10) / 10);

const GRID = "grid gap-4 sm:grid-cols-2 lg:grid-cols-4";

const Skeleton: React.FC = () => (
  <div className={GRID}>
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="border-border/70 bg-card h-24 animate-pulse rounded-xl border" />
    ))}
  </div>
);

const CoverageGapsCard: React.FC<{ gaps: AdminOverview["coverage_gaps"] }> = ({ gaps }) => {
  const rows: [string, number][] = [
    ["Teams without a leader", gaps.teams_without_leader],
    ["Users without a team", gaps.users_without_team],
    ["Users without a tech", gaps.users_without_tech],
    ["Employees without a TL", gaps.employees_without_tl],
    ["Albanian TLs without HBPR", gaps.al_tls_without_hbpr_assignment],
  ];
  const total = rows.reduce((sum, [, n]) => sum + n, 0);
  return (
    <GlassCard delay={0.05} glow={total > 0 ? "warning" : "success"}>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-xs">Coverage Gaps</p>
          <AlertCircle
            className={`h-5 w-5 ${total > 0 ? "text-warning" : "text-success"}`}
            aria-hidden
          />
        </div>
        <ul className="mt-2 space-y-1 text-xs">
          {rows.map(([label, n]) => (
            <li key={label} className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{label}</span>
              <span
                className={`font-mono tabular-nums ${n > 0 ? "text-warning font-semibold" : ""}`}
              >
                {n}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </GlassCard>
  );
};

const BackupCard: React.FC<{ backup: NonNullable<AdminOverview["backup"]> }> = ({ backup }) => {
  const none = backup.count === 0;
  return (
    <StatCard
      label="Backup Status"
      value={none ? "None" : `${Math.max(0, Math.round((backup.age_hours ?? 0) / 24))}d ago`}
      icon={HardDrive}
      glow={backup.stale ? "destructive" : "success"}
      iconColorClass={backup.stale ? "text-destructive" : "text-success"}
      iconWellClass={backup.stale ? "bg-destructive/10" : "bg-success/10"}
      valueColorClass={backup.stale ? "text-destructive" : undefined}
      trend={
        none
          ? "No backups yet"
          : backup.stale
            ? "Stale — over 7 days old"
            : `${fmt(backup.size_mb ?? 0)} MB · ${backup.count} backups`
      }
      delay={0.3}
    />
  );
};

export const OverviewWidgets: React.FC<OverviewWidgetsProps> = ({
  isWidgetActive,
  data,
  isLoading,
  isError,
  onRetry,
  isSuperuser,
}) => {
  const on = (id: (typeof OVERVIEW_WIDGET_IDS)[number]) =>
    isWidgetActive(id) && (id !== "backup-status" || isSuperuser);
  if (!OVERVIEW_WIDGET_IDS.some(on)) return null;

  if (isLoading) return <Skeleton />;
  if (isError || !data) {
    return (
      <ErrorCard
        title="Couldn't load the overview"
        message="The admin overview request failed."
        onRetry={onRetry}
      />
    );
  }

  const { headcount, pending_backlog: backlog, leave_utilization: leave } = data;
  const carry = data.carryover_expiry;
  const close = data.period_close;
  const pendingTotal = backlog.overtime.count + backlog.standby.count + backlog.leave.count;
  const moreTls = close.tls_open - close.open_tls.length;

  return (
    <div className="space-y-4">
      <div className={GRID}>
        {on("org-headcount") && (
          <StatCard
            label="Headcount"
            value={headcount.total_users}
            icon={Users}
            glow="primary"
            iconColorClass="text-primary"
            iconWellClass="bg-primary/10"
            trend={`${headcount.active_users} active`}
            footer={
              <>
                <span className="text-muted-foreground">{headcount.new_hires_30d} new in 30d</span>
                <span className="text-muted-foreground">
                  {headcount.never_logged_in} never logged in
                </span>
              </>
            }
          />
        )}
        {on("coverage-gaps") && <CoverageGapsCard gaps={data.coverage_gaps} />}
        {on("pending-backlog") && (
          <StatCard
            label="Pending Backlog"
            value={pendingTotal}
            icon={Clock}
            glow={pendingTotal > 0 ? "warning" : "success"}
            iconColorClass="text-warning"
            iconWellClass="bg-warning/10"
            delay={0.1}
            trend={`${fmt(backlog.overtime.hours)}h overtime · ${fmt(backlog.standby.hours)}h standby · ${backlog.leave.days}d leave`}
          />
        )}
        {on("leave-utilization") && (
          <StatCard
            label="Leave Utilization"
            value={leave.utilization_pct === null ? "—" : `${fmt(leave.utilization_pct)}%`}
            icon={CalendarDays}
            iconColorClass="text-accent-violet"
            iconWellClass="bg-accent-violet/10"
            delay={0.15}
            progressPercent={leave.utilization_pct ?? 0}
            trend={`${fmt(leave.used_days)} used · ${fmt(leave.pending_days)} pending of ${fmt(leave.total_days)}d (${leave.year})`}
          />
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-4">
        {on("approval-aging") && <ApprovalAgingWidget aging={data.approval_aging} />}
        {on("carryover-expiry") && (
          <StatCard
            label="Carryover Expiry"
            value={`${fmt(carry.days_at_risk)}d`}
            icon={CalendarClock}
            glow={carry.days_at_risk > 0 ? "warning" : "none"}
            iconColorClass="text-warning"
            iconWellClass="bg-warning/10"
            delay={0.25}
            trend={`${carry.users_affected} users · expiring within ${carry.window_days} days`}
          />
        )}
        {on("period-close") && (
          <StatCard
            label={`Period Close (${close.period})`}
            value={`${close.tls_closed}/${close.tls_total}`}
            icon={CheckCircle}
            glow={close.tls_open > 0 ? "warning" : "success"}
            iconColorClass={close.tls_open > 0 ? "text-warning" : "text-success"}
            iconWellClass={close.tls_open > 0 ? "bg-warning/10" : "bg-success/10"}
            delay={0.3}
            trend={
              close.tls_open === 0
                ? "All TLs closed"
                : close.open_tls.map((t) => t.name).join(", ") +
                  (moreTls > 0 ? ` +${moreTls} more` : "")
            }
          />
        )}
        {on("backup-status") && data.backup && <BackupCard backup={data.backup} />}
      </div>
    </div>
  );
};
