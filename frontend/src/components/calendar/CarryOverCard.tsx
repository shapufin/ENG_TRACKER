import React from "react";

import { Progress } from "@/components/ui/progress";
import { CalendarDays } from "lucide-react";
import { format } from "date-fns";
import type { VacationBalanceBreakdown } from "@/lib/vacation-balance";

interface CarryOverCardProps {
  carryOverDetail: VacationBalanceBreakdown["carryOver"];
  carryOverProgress: number;
}

/**
 * Display card for carry-over vacation days.
 * Shows used/remaining carry-over days with progress bar.
 *
 * Extracted from UserStatusModal to reduce complexity.
 */
export const CarryOverCard: React.FC<CarryOverCardProps> = ({
  carryOverDetail,
  carryOverProgress,
}) => {
  if (!carryOverDetail) return null;

  return (
    <div className="rounded-3xl border border-tone-success-border bg-tone-success-surface p-4">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-xl bg-tone-success-surface p-2">
          <CalendarDays className="h-4 w-4 text-tone-success-text" />
        </div>

        <h4 className="text-lg font-semibold text-tone-success-text">Carry-over</h4>
      </div>

      <div className="mb-4">
        <div className="flex items-end gap-2">
          <span className="text-4xl font-bold">{carryOverDetail.effectiveAvailableDays ?? 0}</span>

          <span className="mb-1 text-lg text-muted-foreground">d</span>
        </div>

        <p className="mt-1 text-xs text-muted-foreground">
          of {carryOverDetail.totalDays ?? 0}d carried over
        </p>
      </div>

      <div className="rounded-2xl border border-line-subtle bg-surface-sunken p-3">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Used</span>

          <span className="font-medium text-foreground dark:text-white">
            {carryOverDetail.usedDays ?? 0}d
          </span>
        </div>

        <Progress value={carryOverProgress} className="h-2 bg-line-subtle" />

        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Remaining</span>

          <span className="font-medium text-tone-success-text">
            {carryOverDetail.effectiveAvailableDays ?? 0}d
          </span>
        </div>
      </div>

      <p className="mt-3 text-[10px] leading-4 text-muted-foreground">
        Carry-over days are used first until{" "}
        {carryOverDetail.expiresAt
          ? format(new Date(carryOverDetail.expiresAt), "d MMM")
          : "31 Mar"}
        . After this date, current year balance applies.
      </p>
    </div>
  );
};
