import React from "react";
import { Plane } from "lucide-react";
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
  const { usedDays, pendingDays, totalDays, accruedDays, yearlyEntitlement, liveAccruedBalance } =
    summary;

  const totalEligible = yearlyEntitlement ?? totalDays;
  const currentAccumulated = accruedDays ?? totalEligible;
  const leftDays = liveAccruedBalance ?? currentAccumulated - usedDays - pendingDays;
  const isNegative = leftDays < 0;

  const baseForPct = currentAccumulated > 0 ? currentAccumulated : totalEligible;
  const pct = (n: number) =>
    baseForPct > 0 ? Math.min(100, Math.max(0, Math.round((n / baseForPct) * 100))) : 0;

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
      className={`border-border/60 from-primary/5 to-primary/10 hover:border-primary/40 group rounded-xl border bg-gradient-to-br p-2.5 transition-all ${
        onShowUserModal ? "cursor-pointer" : ""
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-primary flex items-center gap-1 text-xs font-bold tracking-wider uppercase">
          <Plane className="h-2.5 w-2.5" />
          Current
        </span>
        {isNegative ? (
          <span className="text-tone-warning-text font-mono text-xs font-bold">In advance</span>
        ) : (
          <span className="text-tone-success-text font-mono text-xs font-bold">
            {pct(leftDays)}% left
          </span>
        )}
      </div>

      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-1">
          <span
            className={cn(
              "font-mono text-base font-extrabold tracking-tight tabular-nums",
              isNegative ? "text-tone-warning-text" : "text-foreground"
            )}
          >
            {formatDays(leftDays)}
          </span>
          <span className="text-muted-foreground font-mono text-xs font-medium">
            {" "}
            / {formatDays(currentAccumulated)}d left
          </span>
        </div>
        <div className="text-muted-foreground flex items-center font-mono text-xs">
          <span>
            Pending:{" "}
            <strong
              className={cn(
                pendingDays > 0
                  ? "text-tone-warning-text font-semibold"
                  : "text-muted-foreground font-medium"
              )}
            >
              {formatDays(pendingDays)}d
            </strong>
          </span>
        </div>
      </div>

      <p className="text-muted-foreground mt-1 font-mono text-xs">
        Total vacation entitlement:{" "}
        <strong className="text-foreground font-semibold">{formatDays(totalEligible)}d</strong>
      </p>

      <div
        role="img"
        aria-label={`Vacation balance: ${formatDays(leftDays)} of ${formatDays(currentAccumulated)} days remaining`}
        className="bg-muted border-border/40 mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full border"
      >
        <div className="bg-success h-full transition-all" style={{ width: `${pct(leftDays)}%` }} />
        <div
          className="bg-warning h-full transition-all"
          style={{ width: `${pct(pendingDays)}%` }}
        />
        <div
          className="bg-destructive h-full transition-all"
          style={{ width: `${pct(usedDays)}%` }}
        />
      </div>
    </section>
  );
};
