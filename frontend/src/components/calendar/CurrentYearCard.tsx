import React from "react";
import { CalendarDays } from "lucide-react";
import type { VacationBalanceBreakdown } from "@/lib/vacation-balance";

interface CurrentYearCardProps {
  currentDetail: VacationBalanceBreakdown["current"];
  vacationYear: number;
}

/**
 * Display card for current year vacation balance.
 * Shows available days and year information.
 *
 * Extracted from UserStatusModal to reduce complexity.
 */
export const CurrentYearCard: React.FC<CurrentYearCardProps> = ({
  currentDetail,
  vacationYear,
}) => {
  if (!currentDetail) return null;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-indigo-500/[0.04] p-4">
      <div className="absolute bottom-0 right-0 h-32 w-32 rounded-full bg-indigo-500/10 blur-3xl" />

      <div className="relative">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-indigo-500/10 p-2">
            <CalendarDays className="h-4 w-4 text-indigo-400" />
          </div>

          <h4 className="text-lg font-semibold text-indigo-300">Current year balance</h4>
        </div>

        <div className="mb-3 flex items-end gap-2">
          <span className="text-4xl font-bold">
            {(currentDetail.effectiveAvailableDays ?? currentDetail.availableDays ?? 0).toFixed(2)}
          </span>

          <span className="mb-1 text-lg text-muted-foreground">d</span>
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          <p>{vacationYear} allowance resets on 1 Jan.</p>

          <p>Carry-over expires on 31 Mar.</p>
        </div>

        <div className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-line-subtle bg-surface-sunken px-3 py-1.5 text-[10px] text-muted-foreground backdrop-blur-md">
          <CalendarDays className="h-3 w-3" />
          Year {vacationYear}
        </div>
      </div>
    </div>
  );
};
