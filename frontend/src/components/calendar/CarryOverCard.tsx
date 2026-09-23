import React from "react";

import { Progress } from "@/components/ui/progress";
import { CalendarDays } from "lucide-react";
import { format } from "date-fns";
import type { VacationBalanceBreakdown } from "@/lib/vacation-balance";
import { formatCompactDays } from "./hooks/userStatusHelpers";

interface CarryOverCardProps {
  carryOverDetail: VacationBalanceBreakdown["carryOver"];
  carryOverProgress: number;
}

/**
 * Compact full-width carry-over strip for the vacation modal.
 * Renders nothing when there is no carry-over detail.
 */
export const CarryOverCard: React.FC<CarryOverCardProps> = ({
  carryOverDetail,
  carryOverProgress,
}) => {
  if (!carryOverDetail) return null;

  const available = carryOverDetail.effectiveAvailableDays ?? 0;
  const expires = carryOverDetail.expiresAt
    ? format(new Date(carryOverDetail.expiresAt), "d MMM")
    : "31 Mar";

  return (
    <div className="mt-3 rounded-2xl border border-tone-success-border bg-tone-success-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="rounded-lg bg-tone-success-surface p-1.5">
            <CalendarDays className="h-4 w-4 text-tone-success-text" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-tone-success-text">Carry-over</p>
            <p className="truncate text-micro-lg text-muted-foreground">
              Used first · expires {expires}
            </p>
          </div>
        </div>
        <p className="shrink-0 font-mono tabular-nums">
          <span className="text-2xl font-bold text-foreground">{formatCompactDays(available)}</span>{" "}
          <span className="text-xs text-muted-foreground">
            of {formatCompactDays(carryOverDetail.totalDays ?? 0)} d
          </span>
        </p>
      </div>
      <Progress value={carryOverProgress} className="mt-3 h-1.5 bg-line-subtle" />
    </div>
  );
};
