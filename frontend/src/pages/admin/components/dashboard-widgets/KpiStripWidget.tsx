import React from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  CalendarClock,
  CalendarDays,
  Clock,
  Inbox,
  Users,
  type LucideIcon,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { IconWell, type Tone } from "@/components/ui/IconWell";
import { cn } from "@/lib/utils";
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
  icon: LucideIcon;
  tone?: Tone;
  to: string;
}

/**
 * The label is a stretched link (its ::after covers the cell), so the hint can
 * hold its own button (Retry) without nesting a button inside an anchor.
 */
const Kpi: React.FC<KpiProps> = ({ label, value, hint, icon: Icon, tone = "neutral", to }) => (
  <div className="hover:bg-muted/40 relative flex h-full min-w-0 flex-col justify-center px-4 py-3 transition-colors motion-reduce:transition-none">
    <div className="flex items-start justify-between gap-2">
      <dt className="text-muted-foreground text-xs">
        <Link
          to={to}
          className="focus-visible:after:ring-ring after:absolute after:inset-0 after:content-[''] focus-visible:outline-hidden focus-visible:after:ring-2 focus-visible:after:ring-inset"
        >
          {label}
        </Link>
      </dt>
      <IconWell size="sm" tone={tone}>
        <Icon className="h-4 w-4" />
      </IconWell>
    </div>
    {value === null ? (
      <Skeleton />
    ) : (
      <dd className="mt-0.5 text-2xl leading-8 font-semibold tracking-tight tabular-nums">
        {value}
      </dd>
    )}
    {hint && (
      <p
        className={cn(
          "text-muted-foreground mt-0.5 truncate text-xs",
          typeof hint === "string" && "pointer-events-none"
        )}
      >
        {hint}
      </p>
    )}
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
  const newHires = data?.headcount.new_hires_30d;

  const fromOverview = (value: string | undefined) => (loadingOverview ? null : (value ?? "—"));

  return (
    <GlassCard
      role="group"
      aria-label="Key figures"
      aria-busy={statsLoading || loadingOverview}
      data-chart-section="kpi-strip"
    >
      <dl className="divide-border/60 grid grid-cols-2 sm:grid-cols-3 sm:divide-x lg:grid-cols-6">
        <Kpi
          label="Users"
          value={stat(totalUsers)}
          icon={Users}
          to="/admin/users"
          hint={newHires === undefined ? undefined : `+${newHires} new � 30d`}
        />
        <Kpi label="Teams" value={stat(totalTeams)} icon={Building2} to="/admin/teams" />
        <Kpi
          label="Pending"
          icon={Inbox}
          tone={totalPending > 0 ? "warning" : "neutral"}
          to="/admin/leave-requests"
          value={stat(totalPending)}
          hint={totalPending === 0 ? "Nothing to decide" : "Needs decision"}
        />
        <Kpi
          label="Overtime"
          value={stat(`${fmt(overtimeHours)}h`)}
          hint="This month"
          icon={Clock}
          to="/admin/overtime-logs"
        />
        <Kpi
          label="Leave used"
          icon={CalendarDays}
          to="/admin/leave-balances"
          value={fromOverview(
            leave
              ? leave.utilization_pct === null
                ? "—"
                : `${fmt(leave.utilization_pct)}%`
              : undefined
          )}
          hint={
            isError ? (
              <Button
                variant="link"
                size="sm"
                className="relative z-10 h-auto p-0 text-xs"
                onClick={onRetry}
              >
                Couldn&apos;t load · Retry
              </Button>
            ) : leave ? (
              `${fmt(leave.used_days)} of ${fmt(leave.total_days)}d (${leave.year})`
            ) : undefined
          }
        />
        <Kpi
          label="Carryover"
          icon={CalendarClock}
          to="/admin/leave-balances?expiring=1"
          value={fromOverview(carry ? `${fmt(carry.days_at_risk)}d` : undefined)}
          hint={carry ? `${carry.users_affected} users · ${carry.window_days}d window` : undefined}
        />
      </dl>
    </GlassCard>
  );
};
