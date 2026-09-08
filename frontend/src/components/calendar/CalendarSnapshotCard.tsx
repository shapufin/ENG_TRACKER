import React from "react";
import type { VacationBalanceBreakdown } from "@/lib/vacation-balance";

interface CalendarSnapshotCardProps {
  summary: VacationBalanceBreakdown | null;
  formatDays: (value: number) => string;
}

export const CalendarSnapshotCard: React.FC<CalendarSnapshotCardProps> = ({
  summary,
  formatDays,
}) => {
  if (!summary) return null;
  const { remainingDays, usedDays, pendingDays, totalDays } = summary;
  const pct = (n: number) => (totalDays > 0 ? Math.min(100, Math.round((n / totalDays) * 100)) : 0);
  return (
    <section
      aria-label="My vacation snapshot"
      className="rounded-2xl border border-line-subtle bg-card p-3"
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        My vacation snapshot
      </p>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="font-mono text-2xl font-bold tabular-nums text-foreground">
          {formatDays(remainingDays)}
          <span className="text-xs font-normal text-muted-foreground">
            {" "}
            / {formatDays(totalDays)}d
          </span>
        </span>
        <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400">
          {pct(remainingDays)}% left
        </span>
      </div>
      <div
        role="img"
        aria-label={`Vacation balance: ${formatDays(remainingDays)} of ${formatDays(totalDays)} days remaining`}
        className="mt-2 flex h-2 w-full overflow-hidden rounded-full border border-line-subtle bg-surface-sunken"
      >
        <div className="h-full bg-success" style={{ width: `${pct(remainingDays)}%` }} />
        <div className="h-full bg-warning" style={{ width: `${pct(pendingDays)}%` }} />
        <div className="h-full bg-destructive" style={{ width: `${pct(usedDays)}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          Used: <strong className="font-semibold text-foreground">{formatDays(usedDays)}d</strong>
        </span>
        <span>
          Pending:{" "}
          <strong className="font-semibold text-amber-700 dark:text-amber-400">
            {formatDays(pendingDays)}d
          </strong>
        </span>
      </div>
    </section>
  );
};
