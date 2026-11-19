import React from "react";
import { Clock, Plane } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VacationBalanceBreakdown } from "@/lib/vacation-balance";

interface CalendarSnapshotCardProps {
  summary: VacationBalanceBreakdown | null;
  formatDays: (value: number) => string;
  onShowUserModal?: () => void;
}

export const CalendarSnapshotCard: React.FC<CalendarSnapshotCardProps> = ({
  summary,
  formatDays,
  onShowUserModal,
}) => {
  if (!summary) return null;
  const {
    remainingDays,
    usedDays,
    pendingDays,
    totalDays,
    accruedDays,
    yearlyEntitlement,
    liveAccruedBalance,
  } = summary;

  const totalEligible = yearlyEntitlement ?? totalDays;
  const accrued = accruedDays ?? totalEligible;
  const liveAccrued = liveAccruedBalance ?? accrued - usedDays - pendingDays;
  const isNegative = liveAccrued < 0;
  const stillAccruing = accrued < totalEligible;

  const pct = (n: number) =>
    totalEligible > 0 ? Math.min(100, Math.round((n / totalEligible) * 100)) : 0;

  return (
    <section
      aria-label="My vacation snapshot"
      role={onShowUserModal ? "button" : undefined}
      tabIndex={onShowUserModal ? 0 : undefined}
      onClick={onShowUserModal}
      onKeyDown={(e) => {
        if (onShowUserModal && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onShowUserModal();
        }
      }}
      className={`group flex flex-col gap-1.5 transition-all ${
        onShowUserModal ? "cursor-pointer" : ""
      }`}
    >
      {/* Card 1: Annual Eligible Vacation (EOY) */}
      <div className="border-border/60 from-primary/5 to-primary/10 hover:border-primary/40 rounded-xl border bg-gradient-to-br p-2 transition-all">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-primary flex items-center gap-1 text-xs font-bold tracking-wider uppercase">
            <Plane className="h-2.5 w-2.5" />
            Snapshot
          </span>
          <span className="text-tone-success-text font-mono text-xs font-bold">
            {pct(remainingDays)}% left
          </span>
        </div>

        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-1">
            <span className="text-foreground font-mono text-base font-extrabold tracking-tight tabular-nums">
              {formatDays(remainingDays)}
            </span>
            <span className="text-muted-foreground font-mono text-xs font-medium">
              {" "}
              / {formatDays(totalEligible)}d
            </span>
          </div>
          <div className="text-muted-foreground flex items-center gap-1.5 font-mono text-xs">
            <span>
              Used:{" "}
              <strong className="text-foreground font-semibold">{formatDays(usedDays)}d</strong>
            </span>
            <span>
              Pending:{" "}
              <strong className="text-tone-warning-text font-semibold">
                {formatDays(pendingDays)}d
              </strong>
            </span>
          </div>
        </div>

        <div
          role="img"
          aria-label={`Vacation balance: ${formatDays(remainingDays)} of ${formatDays(totalEligible)} days remaining`}
          className="bg-muted border-border/40 mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full border"
        >
          <div
            className="bg-success h-full transition-all"
            style={{ width: `${pct(remainingDays)}%` }}
          />
          <div
            className="bg-warning h-full transition-all"
            style={{ width: `${pct(pendingDays)}%` }}
          />
          <div
            className="bg-destructive h-full transition-all"
            style={{ width: `${pct(usedDays)}%` }}
          />
        </div>
      </div>

      {/* Card 2: Live Accrual (Earned to Date) */}
      <div className="border-border/60 bg-muted/20 hover:border-border rounded-xl border p-2 transition-all">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-muted-foreground flex items-center gap-1 text-xs font-bold tracking-wider uppercase">
            <Clock className="text-primary h-2.5 w-2.5" />
            Live Accrual
          </span>
          <span
            className={cn(
              "font-mono text-xs font-bold",
              isNegative ? "text-tone-warning-text" : "text-tone-success-text"
            )}
          >
            {isNegative ? "In advance" : "Earned to date"}
          </span>
        </div>

        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-1.5">
            <span
              className={cn(
                "font-mono text-base font-extrabold tracking-tight tabular-nums",
                isNegative ? "text-tone-warning-text" : "text-tone-success-text"
              )}
            >
              {liveAccrued >= 0 ? `+${formatDays(liveAccrued)}` : `${formatDays(liveAccrued)}`}d
            </span>
            <span className="text-muted-foreground font-mono text-xs">
              {isNegative ? "borrowed" : "available"}
            </span>
          </div>
          <span className="text-muted-foreground font-mono text-xs">
            {stillAccruing ? (
              <>
                Accrued so far:{" "}
                <strong className="text-foreground font-semibold">{formatDays(accrued)}</strong> of{" "}
                {formatDays(totalEligible)}d
              </>
            ) : (
              "Fully accrued"
            )}
          </span>
        </div>
      </div>
    </section>
  );
};
