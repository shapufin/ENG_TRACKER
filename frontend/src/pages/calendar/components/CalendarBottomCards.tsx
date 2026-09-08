import React from "react";
import { MetricBar } from "@/components/calendar/MetricBar";
import { ConflictItem } from "@/components/calendar/ConflictItem";

interface Metric {
  label: string;
  value: string;
  progress: number;
  colorClass: string;
}

interface CarryOverData {
  carryOver?: { available_days?: number; year?: number; effective_available_days?: number } | null;
  currentBalance?: { available_days?: number; effective_available_days?: number } | null;
}

interface ConflictEntry {
  date: string;
  description: string;
}

interface CalendarBottomCardsProps {
  vacationSummary?: { remainingDays?: number; totalDays?: number } | null;
  carryOverAndBalance: CarryOverData;
  metricBars: Metric[];
  conflictEntries: ConflictEntry[];
  formatDays: (value: number) => string;
  onViewAllConflicts: () => void;
}

const VacationBalanceCard: React.FC<{
  remainingDays: number;
  totalDays: number;
  metricBars: Metric[];
  formatDays: (value: number) => string;
}> = ({ remainingDays, totalDays, metricBars, formatDays }) => (
  <div className="rounded-2xl border border-border/70 bg-card p-2">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
          Vacation balance
        </p>
        <div className="flex items-end gap-1">
          <h3 className="text-xl font-semibold text-foreground dark:text-white">
            {formatDays(remainingDays)}d
          </h3>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-300">remaining</span>
        </div>
      </div>
      <div className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
        {formatDays(totalDays)}d total
      </div>
    </div>
    <div className="mt-2 grid gap-1.5">
      {metricBars.map((metric) => (
        <MetricBar
          key={metric.label}
          label={metric.label}
          value={metric.value}
          progress={metric.progress}
          colorClass={metric.colorClass}
        />
      ))}
    </div>
  </div>
);

const CarryOverCard: React.FC<{
  carryOver: CarryOverData["carryOver"];
  formatDays: (value: number) => string;
  // fallow-ignore-next-line complexity
}> = ({ carryOver, formatDays }) => {
  const year = carryOver?.year ?? new Date().getFullYear();
  const availableDays = carryOver?.available_days ?? 0;
  return (
    <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-2 dark:border-emerald-400/30 dark:bg-emerald-500/10">
      <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.3em] text-emerald-700 dark:text-emerald-200">
        <p>Carryover</p>
        <span>from {year}</span>
      </div>
      <div className="mt-2 flex items-end gap-2">
        <h3 className="text-xl font-semibold text-foreground dark:text-white">
          {formatDays(availableDays)}d
        </h3>
        <p className="text-[11px] text-emerald-600 dark:text-emerald-200">available</p>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-500/20">
        <div
          className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
          style={{ width: `${availableDays > 0 ? 100 : 0}%` }}
        />
      </div>
      <div className="mt-2 text-[10px] text-emerald-700 dark:text-emerald-100">
        <p>Expires Mar 31, {year + 1}</p>
      </div>
    </div>
  );
};

const ConflictsCard: React.FC<{
  conflictEntries: ConflictEntry[];
  onViewAllConflicts: () => void;
}> = ({ conflictEntries, onViewAllConflicts }) => (
  <div className="rounded-2xl border border-border/70 bg-card p-2">
    <div className="flex items-center justify-between">
      <p className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
        Upcoming conflicts
      </p>
      <div className="rounded-full bg-rose-100 px-2 py-0.5 text-[9px] text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
        {conflictEntries.length}
      </div>
    </div>
    <div className="mt-2 space-y-1.5">
      {conflictEntries.length === 0 && (
        <p className="text-xs text-muted-foreground">No conflicts this month.</p>
      )}
      {conflictEntries.map((conflict) => (
        <ConflictItem key={conflict.date} date={conflict.date} description={conflict.description} />
      ))}
    </div>
    <button
      onClick={onViewAllConflicts}
      className="mt-2 text-[11px] font-medium text-primary transition hover:text-primary/80"
    >
      View all conflicts →
    </button>
  </div>
);

// fallow-ignore-next-line complexity
export const CalendarBottomCards: React.FC<CalendarBottomCardsProps> = ({
  vacationSummary,
  carryOverAndBalance,
  metricBars,
  conflictEntries,
  formatDays,
  onViewAllConflicts,
}) => (
  <div className="grid flex-shrink-0 gap-2 md:grid-cols-3">
    <VacationBalanceCard
      remainingDays={vacationSummary?.remainingDays ?? 0}
      totalDays={vacationSummary?.totalDays ?? 0}
      metricBars={metricBars}
      formatDays={formatDays}
    />
    <CarryOverCard carryOver={carryOverAndBalance.carryOver} formatDays={formatDays} />
    <ConflictsCard conflictEntries={conflictEntries} onViewAllConflicts={onViewAllConflicts} />
  </div>
);
