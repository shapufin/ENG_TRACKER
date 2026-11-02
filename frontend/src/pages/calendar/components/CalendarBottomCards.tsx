import { currentBusinessDateISO } from "@/lib/date-format-utils";
import React from "react";
import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import { MetricBar } from "@/components/calendar/MetricBar";
import { ConflictItem } from "@/components/calendar/ConflictItem";
import { toneSurfaceClass, toneTextClass } from "@/components/ui/tone";

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
  onOpenBalanceModal?: () => void;
}

const VacationBalanceCard: React.FC<{
  remainingDays: number;
  totalDays: number;
  metricBars: Metric[];
  formatDays: (value: number) => string;
  onOpenBalanceModal?: () => void;
}> = ({ remainingDays, totalDays, metricBars, formatDays, onOpenBalanceModal }) => (
  <div
    role={onOpenBalanceModal ? "button" : undefined}
    tabIndex={onOpenBalanceModal ? 0 : undefined}
    onClick={onOpenBalanceModal}
    onKeyDown={(e) => {
      if (onOpenBalanceModal && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        onOpenBalanceModal();
      }
    }}
    aria-label="Vacation balance details"
    className={`border-border/70 bg-card group flex flex-col justify-between rounded-xl border p-2.5 transition-all ${
      onOpenBalanceModal ? "hover:bg-card-raised/80 cursor-pointer" : ""
    }`}
  >
    <div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
          Vacation Balance
        </span>
        <span
          className={`rounded-full px-2 py-0.5 font-mono text-xs font-semibold ${toneSurfaceClass.success}`}
        >
          {formatDays(totalDays)}d total
        </span>
      </div>
      <div className="mt-1 flex items-baseline justify-between">
        <div className="flex items-baseline gap-1.5">
          <h3 className="text-foreground font-mono text-xl font-bold tracking-tight">
            {formatDays(remainingDays)}d
          </h3>
          <span className={`text-xs font-medium ${toneTextClass.success}`}>remaining</span>
        </div>
        {onOpenBalanceModal && (
          <div className="text-primary flex items-center text-xs font-semibold transition-transform group-hover:translate-x-0.5">
            <span>View details</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </div>
        )}
      </div>
    </div>
    {metricBars.length > 0 && (
      <div className="border-border/40 mt-2 grid gap-1 border-t pt-1.5">
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
    )}
  </div>
);

const CarryOverCard: React.FC<{
  carryOver: CarryOverData["carryOver"];
  formatDays: (value: number) => string;
  onOpenBalanceModal?: () => void;
}> = ({ carryOver, formatDays, onOpenBalanceModal }) => {
  const year = carryOver?.year ?? Number(currentBusinessDateISO().slice(0, 4));
  const availableDays = carryOver?.available_days ?? 0;
  return (
    <div
      role={onOpenBalanceModal ? "button" : undefined}
      tabIndex={onOpenBalanceModal ? 0 : undefined}
      onClick={onOpenBalanceModal}
      onKeyDown={(e) => {
        if (onOpenBalanceModal && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpenBalanceModal();
        }
      }}
      aria-label="Carryover allowance details"
      className={`border-border/70 bg-card group flex flex-col justify-between rounded-xl border p-2.5 transition-all ${
        onOpenBalanceModal ? "hover:bg-card-raised/80 cursor-pointer" : ""
      }`}
    >
      <div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
            Carryover
          </span>
          <span className="text-muted-foreground/80 font-mono text-xs">FROM {year}</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <div className="flex items-baseline gap-1.5">
            <h3 className="text-foreground font-mono text-xl font-bold tracking-tight">
              {formatDays(availableDays)}d
            </h3>
            <span className={`text-xs font-medium ${toneTextClass.success}`}>available</span>
          </div>
          <span className="text-muted-foreground font-mono text-xs">
            Expires Mar 31, {year + 1}
          </span>
        </div>
      </div>
      <div className="bg-surface-sunken mt-2 h-1.5 w-full overflow-hidden rounded-full">
        <div
          className="bg-success h-full rounded-full transition-all"
          style={{ width: `${availableDays > 0 ? 100 : 0}%` }}
        />
      </div>
    </div>
  );
};

const ConflictsCard: React.FC<{
  conflictEntries: ConflictEntry[];
  onViewAllConflicts: () => void;
}> = ({ conflictEntries, onViewAllConflicts }) => {
  const hasConflicts = conflictEntries.length > 0;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onViewAllConflicts}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onViewAllConflicts();
        }
      }}
      aria-label={`Upcoming conflicts: ${conflictEntries.length} alerts`}
      className={`border-border/70 bg-card group hover:bg-card-raised/80 flex cursor-pointer flex-col justify-between rounded-xl border p-2.5 transition-all ${
        hasConflicts ? "border-warning/40 bg-warning/5" : ""
      }`}
    >
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {hasConflicts ? (
              <AlertTriangle className="text-warning h-3.5 w-3.5" />
            ) : (
              <CheckCircle2 className="text-success h-3.5 w-3.5" />
            )}
            <span className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
              Upcoming Conflicts
            </span>
          </div>
          <span
            role="status"
            aria-label={`${conflictEntries.length} upcoming conflicts`}
            className={`rounded-full px-2 py-0.5 font-mono text-xs font-bold ${
              hasConflicts ? toneSurfaceClass.danger : toneSurfaceClass.neutral
            }`}
          >
            {conflictEntries.length}
          </span>
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-foreground truncate text-xs font-medium">
            {hasConflicts
              ? `${conflictEntries.length} staffing alerts this month`
              : "No conflicts this month."}
          </span>
          <div className="text-primary flex items-center text-xs font-semibold transition-transform group-hover:translate-x-0.5">
            <span>{hasConflicts ? "Review alerts" : "Check roster"}</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>
      {hasConflicts && conflictEntries.length > 0 && (
        <div className="border-border/40 mt-2 space-y-1 border-t pt-1.5">
          {conflictEntries.slice(0, 2).map((conflict) => (
            <ConflictItem
              key={conflict.date}
              date={conflict.date}
              description={conflict.description}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const CalendarBottomCards: React.FC<CalendarBottomCardsProps> = ({
  vacationSummary,
  carryOverAndBalance,
  metricBars,
  conflictEntries,
  formatDays,
  onViewAllConflicts,
  onOpenBalanceModal,
}) => (
  <div className="grid shrink-0 gap-2 md:grid-cols-3">
    <VacationBalanceCard
      remainingDays={vacationSummary?.remainingDays ?? 0}
      totalDays={vacationSummary?.totalDays ?? 0}
      metricBars={metricBars}
      formatDays={formatDays}
      onOpenBalanceModal={onOpenBalanceModal}
    />
    <CarryOverCard
      carryOver={carryOverAndBalance.carryOver}
      formatDays={formatDays}
      onOpenBalanceModal={onOpenBalanceModal}
    />
    <ConflictsCard conflictEntries={conflictEntries} onViewAllConflicts={onViewAllConflicts} />
  </div>
);
