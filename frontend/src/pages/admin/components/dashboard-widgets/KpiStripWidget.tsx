import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import type { AdminOverview } from "@/types";

interface OverviewState {
  data?: AdminOverview;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

interface KpiStripWidgetProps {
  totalUsers: number;
  totalTeams: number;
  totalPending: number;
  overtimeHours: number;
  statsLoading?: boolean;
  /** State of the shared admin_overview request (leave and carryover come from it). */
  overview: OverviewState;
}

/** Whole numbers stay whole, fractions keep one decimal (12.5, 16). */
const fmt = (n: number) => String(Math.round(n * 10) / 10);

const Skeleton: React.FC = () => (
  <div aria-hidden className="bg-muted/40 mt-1 h-7 w-16 animate-pulse rounded-md" />
);

interface KpiProps {
  label: string;
  /** Null renders the loading placeholder. */
  value: string | number | null;
  hint?: React.ReactNode;
}

const Kpi: React.FC<KpiProps> = ({ label, value, hint }) => (
  <div className="min-w-0 px-4 py-3">
    <dt className="text-muted-foreground text-xs">{label}</dt>
    {value === null ? (
      <Skeleton />
    ) : (
      <dd className="mt-0.5 text-2xl leading-8 font-semibold tracking-tight tabular-nums">
        {value}
      </dd>
    )}
    {hint && <p className="text-muted-foreground mt-0.5 truncate text-xs">{hint}</p>}
  </div>
);

/** Six headline numbers in one compact card (replaces the old per-metric tiles). */
export const KpiStripWidget: React.FC<KpiStripWidgetProps> = ({
  totalUsers,
  totalTeams,
  totalPending,
  overtimeHours,
  statsLoading,
  overview,
}) => {
  const { data, isLoading, isError, onRetry } = overview;
  const stat = (v: number | string) => (statsLoading ? null : v);
  const loadingOverview = isLoading || (!data && !isError);
  const leave = data?.leave_utilization;
  const carry = data?.carryover_expiry;

  const fromOverview = (value: string | undefined) => (loadingOverview ? null : (value ?? "—"));

  return (
    <GlassCard
      role="group"
      aria-label="Key figures"
      aria-busy={statsLoading || loadingOverview}
      data-chart-section="kpi-strip"
    >
      <dl className="divide-border/60 grid grid-cols-2 sm:grid-cols-3 sm:divide-x lg:grid-cols-6">
        <Kpi label="Users" value={stat(totalUsers)} />
        <Kpi label="Teams" value={stat(totalTeams)} />
        <Kpi
          label="Pending"
          value={stat(totalPending)}
          hint={totalPending === 0 ? "Nothing to decide" : "Needs decision"}
        />
        <Kpi label="Overtime" value={stat(`${fmt(overtimeHours)}h`)} hint="This month" />
        <Kpi
          label="Leave used"
          value={fromOverview(
            leave
              ? leave.utilization_pct === null
                ? "—"
                : `${fmt(leave.utilization_pct)}%`
              : undefined
          )}
          hint={
            isError ? (
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onRetry}>
                Couldn&apos;t load · Retry
              </Button>
            ) : leave ? (
              `${fmt(leave.used_days)} of ${fmt(leave.total_days)}d (${leave.year})`
            ) : undefined
          }
        />
        <Kpi
          label="Carryover"
          value={fromOverview(carry ? `${fmt(carry.days_at_risk)}d` : undefined)}
          hint={carry ? `${carry.users_affected} users · ${carry.window_days}d window` : undefined}
        />
      </dl>
    </GlassCard>
  );
};
