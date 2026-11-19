import React from "react";
import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { toneSurfaceClass, toneTextClass } from "@/components/ui/tone";
import { formatDays as formatDaysDefault } from "@/lib/calendarPageMetrics";
import { currentBusinessDateISO } from "@/lib/date-format-utils";
import type { PublicHoliday } from "@/types";

interface CarryOverData {
  carryOver?: {
    available_days?: number | string;
    year?: number;
    effective_available_days?: number;
  } | null;
  currentBalance?: { available_days?: number | string; effective_available_days?: number } | null;
}

interface ConflictEntry {
  date: string;
  description: string;
}

interface CalendarBottomCardsProps {
  nextHoliday?: PublicHoliday | null;
  carryOverAndBalance: CarryOverData;
  conflictEntries: ConflictEntry[];
  formatDays?: (value: number) => string;
  onViewAllConflicts: () => void;
  onOpenBalanceModal?: () => void;
  onOpenHolidaysModal?: () => void;
}

/** Leave balances arrive from the API as decimal strings; never add them raw. */
const num = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatRelativeDays = (dateStr: string): string => {
  const todayStr = currentBusinessDateISO().slice(0, 10);
  if (dateStr === todayStr) return "Today";
  const start = parseISO(todayStr);
  const target = parseISO(dateStr);
  const diff = differenceInCalendarDays(target, start);
  if (diff === 1) return "Tomorrow";
  if (diff > 1) return `in ${diff} days`;
  return format(target, "d MMM");
};

const CardShell: React.FC<{
  onClick?: () => void;
  label: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}> = ({ onClick, label, trailing, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    aria-label={label}
    className={cn(
      "border-border/60 bg-muted/30 group flex flex-col justify-between gap-1 rounded-lg border px-2.5 py-1.5 text-left transition",
      onClick && "hover:bg-muted/60 cursor-pointer"
    )}
  >
    <span className="flex w-full items-center justify-between gap-2">
      <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {label}
      </span>
      {trailing}
    </span>
    {children}
  </button>
);

/**
 * The pinned metrics strip under the month grid. Density follows the reference
 * mockup: one label row, one value row, no nested cards — it has to cost the
 * grid as little height as possible while a month is on screen.
 */
export const CalendarBottomCards: React.FC<CalendarBottomCardsProps> = ({
  nextHoliday,
  carryOverAndBalance,
  conflictEntries,
  formatDays = formatDaysDefault,
  onViewAllConflicts,
  onOpenBalanceModal,
  onOpenHolidaysModal,
}) => {
  const carried = carryOverAndBalance.carryOver;
  const carriedDays = num(carried?.effective_available_days ?? carried?.available_days);
  const carriedYear = carried?.year;

  const hasConflicts = conflictEntries.length > 0;
  const firstConflict = conflictEntries[0];

  const holidayDateStr = nextHoliday?.date?.slice(0, 10);
  const holidayDateObj = holidayDateStr ? parseISO(holidayDateStr) : null;
  const formattedHolidayDate =
    holidayDateObj && !Number.isNaN(holidayDateObj.getTime())
      ? format(holidayDateObj, "d MMM")
      : null;

  return (
    <div
      className="border-border/60 bg-card/40 hidden shrink-0 border-t px-2 py-1.5 md:block"
      aria-label="Calendar summary"
    >
      <div className="grid gap-2 md:grid-cols-3">
        {/* Card 1: Replaces redundant vacation card with next public holiday */}
        <CardShell
          label="Upcoming holiday"
          onClick={onOpenHolidaysModal ?? onOpenBalanceModal}
          trailing={
            formattedHolidayDate ? (
              <span className="text-muted-foreground font-mono text-xs">
                {formattedHolidayDate}
              </span>
            ) : null
          }
        >
          <span className="flex w-full items-baseline justify-between gap-2">
            <span className="text-foreground truncate font-mono text-base font-bold tracking-tight">
              {nextHoliday?.name ?? "No upcoming holidays"}
            </span>
            <span className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold transition-transform group-hover:translate-x-0.5">
              {holidayDateStr ? (
                <span className="text-tone-info-text font-semibold">
                  {formatRelativeDays(holidayDateStr)}
                </span>
              ) : (
                "—"
              )}
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
            </span>
          </span>
        </CardShell>

        {/* Card 2: Carry-Over */}
        <CardShell
          label="Carry-over"
          onClick={onOpenBalanceModal}
          trailing={
            carriedYear ? (
              <span className="text-muted-foreground font-mono text-xs">from {carriedYear}</span>
            ) : null
          }
        >
          <span className="flex w-full items-baseline justify-between gap-2">
            <span className="text-tone-success-text font-mono text-lg font-bold tracking-tight">
              {carriedDays > 0 ? `${formatDays(carriedDays)}d` : "—"}
            </span>
            <span className="text-muted-foreground text-xs font-medium">
              {carriedDays > 0 ? "available" : "none"}
            </span>
          </span>
        </CardShell>

        {/* Card 3: Upcoming Conflicts */}
        <CardShell
          label="Upcoming conflicts"
          onClick={onViewAllConflicts}
          trailing={
            <span
              className={cn(
                "rounded-full border px-1.5 py-0.5 font-mono text-xs font-bold",
                hasConflicts ? toneSurfaceClass.warning : toneSurfaceClass.neutral
              )}
            >
              {conflictEntries.length}
            </span>
          }
        >
          <span className="flex w-full items-center gap-1.5">
            {hasConflicts ? (
              <AlertTriangle
                className={cn("h-3.5 w-3.5 shrink-0", toneTextClass.warning)}
                aria-hidden="true"
              />
            ) : (
              <CheckCircle2
                className={cn("h-3.5 w-3.5 shrink-0", toneTextClass.success)}
                aria-hidden="true"
              />
            )}
            <span className="text-foreground min-w-0 flex-1 truncate text-xs font-medium">
              {hasConflicts
                ? `${conflictEntries.length} staffing alert${conflictEntries.length === 1 ? "" : "s"} · ${firstConflict?.date ?? ""}`
                : "No conflicts this month"}
            </span>
            <ChevronRight
              className="text-muted-foreground h-3 w-3 shrink-0 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </span>
        </CardShell>
      </div>
    </div>
  );
};
