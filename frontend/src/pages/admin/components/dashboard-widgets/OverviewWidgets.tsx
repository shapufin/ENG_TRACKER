import React from "react";
import { AlertCircle, CheckCircle, HardDrive } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { GlassCard } from "@/components/ui/GlassCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { OVERVIEW_WIDGET_IDS } from "@/config/dashboardWidgets";
import type { AdminOverview } from "@/types";
import { KpiStripWidget } from "./KpiStripWidget";

export interface OverviewStats {
  totalUsers: number;
  totalTeams: number;
  totalPending: number;
  overtimeHours: number;
  statsLoading?: boolean;
}

interface OverviewWidgetsProps {
  isWidgetActive: (id: string) => boolean;
  data?: AdminOverview;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  isSuperuser: boolean;
  stats: OverviewStats;
}

/** Whole numbers stay whole, fractions keep one decimal (12.5, 16). */
const fmt = (n: number) => String(Math.round(n * 10) / 10);

const CardSkeleton: React.FC<{ label: string }> = ({ label }) => (
  <div
    role="status"
    aria-label={`Loading ${label}`}
    className="border-border bg-card h-24 animate-pulse rounded-xl border"
  />
);

const CoverageGapsCard: React.FC<{
  gaps: AdminOverview["coverage_gaps"];
  headcount: AdminOverview["headcount"];
}> = ({ gaps, headcount }) => {
  const rows: [string, number][] = [
    ["Teams without a leader", gaps.teams_without_leader],
    ["Users without a team", gaps.users_without_team],
    ["Users without a tech", gaps.users_without_tech],
    ["Employees without a TL", gaps.employees_without_tl],
    ["Albanian TLs without HBPR", gaps.al_tls_without_hbpr_assignment],
  ];
  const total = rows.reduce((sum, [, n]) => sum + n, 0);
  return (
    <GlassCard glow={total > 0 ? "warning" : "success"}>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold tracking-tight">Coverage Gaps</p>
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
        <ul className="border-line-subtle mt-3 space-y-1 border-t pt-3 text-xs">
          <li className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">New in 30 days</span>
            <span className="font-mono tabular-nums">{headcount.new_hires_30d}</span>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Never logged in</span>
            <span className="font-mono tabular-nums">{headcount.never_logged_in}</span>
          </li>
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
  stats,
}) => {
  const on = (id: (typeof OVERVIEW_WIDGET_IDS)[number]) =>
    isWidgetActive(id) && (id !== "backup-status" || isSuperuser);
  if (!OVERVIEW_WIDGET_IDS.some(on)) return null;

  // One request feeds these cards: until it lands each card shows its own placeholder, and a
  // failure shows one retry card per widget instead of replacing the whole grid.
  const failed = !isLoading && (isError || !data);
  const state = (label: string, render: (d: AdminOverview) => React.ReactNode) => {
    if (isLoading) return <CardSkeleton label={label} />;
    if (failed || !data) {
      return (
        <ErrorCard
          title={`Couldn't load ${label.toLowerCase()}`}
          message="The admin overview request failed."
          onRetry={onRetry}
        />
      );
    }
    return render(data);
  };

  return (
    <>
      {on("kpi-strip") && (
        <KpiStripWidget
          totalUsers={stats.totalUsers}
          totalTeams={stats.totalTeams}
          totalPending={stats.totalPending}
          overtimeHours={stats.overtimeHours}
          statsLoading={stats.statsLoading}
          overview={{ data, isLoading, isError: failed, onRetry }}
        />
      )}
      {on("coverage-gaps") &&
        state("Coverage gaps", (d) => (
          <CoverageGapsCard gaps={d.coverage_gaps} headcount={d.headcount} />
        ))}
      {on("period-close") &&
        state("Period close", ({ period_close: close }) => {
          const moreTls = close.tls_open - close.open_tls.length;
          return (
            <StatCard
              label={`Period Close (${close.period})`}
              value={`${close.tls_closed}/${close.tls_total}`}
              icon={CheckCircle}
              glow={close.tls_open > 0 ? "warning" : "success"}
              iconColorClass={close.tls_open > 0 ? "text-warning" : "text-success"}
              iconWellClass={close.tls_open > 0 ? "bg-warning/10" : "bg-success/10"}
              trend={
                close.tls_open === 0
                  ? "All TLs closed"
                  : close.open_tls.map((t) => t.name).join(", ") +
                    (moreTls > 0 ? ` +${moreTls} more` : "")
              }
            />
          );
        })}
      {on("backup-status") &&
        (isLoading || failed || data?.backup) &&
        state("Backup status", (d) => (d.backup ? <BackupCard backup={d.backup} /> : null))}
    </>
  );
};
