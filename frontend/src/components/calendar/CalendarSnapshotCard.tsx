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
      className="border-line-subtle bg-card rounded-2xl border p-3"
    >
      <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
        My vacation snapshot
      </p>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="text-foreground font-mono text-2xl font-bold tabular-nums">
          {formatDays(remainingDays)}
          <span className="text-muted-foreground text-xs font-normal">
            {" "}
            / {formatDays(totalDays)}d
          </span>
        </span>
        <span className="text-tone-success-text font-mono text-xs font-bold">
          {pct(remainingDays)}% left
        </span>
      </div>
      <div
        role="img"
        aria-label={`Vacation balance: ${formatDays(remainingDays)} of ${formatDays(totalDays)} days remaining`}
        className="border-line-subtle bg-surface-sunken mt-2 flex h-2 w-full overflow-hidden rounded-full border"
      >
        <div className="bg-success h-full" style={{ width: `${pct(remainingDays)}%` }} />
        <div className="bg-warning h-full" style={{ width: `${pct(pendingDays)}%` }} />
        <div className="bg-destructive h-full" style={{ width: `${pct(usedDays)}%` }} />
      </div>
      <div className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
        <span>
          Used: <strong className="text-foreground font-semibold">{formatDays(usedDays)}d</strong>
        </span>
        <span>
          Pending:{" "}
          <strong className="text-tone-warning-text font-semibold">
            {formatDays(pendingDays)}d
          </strong>
        </span>
      </div>
    </section>
  );
};
