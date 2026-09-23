import React from "react";
import { Badge } from "@/components/ui/badge";
import { toneSurfaceClass, toneTextClass } from "@/components/ui/tone";
import { CalendarDays, Info } from "lucide-react";
import { format } from "date-fns";
import type { PublicHoliday } from "@/types";

interface UpcomingHolidaysProps {
  holidays: PublicHoliday[];
}

/**
 * Display upcoming holidays list.
 * Shows next 3 upcoming holidays with dates and types.
 *
 * Extracted from UserStatusModal to reduce complexity.
 */
export const UpcomingHolidays: React.FC<UpcomingHolidaysProps> = ({ holidays }) => {
  return (
    <div className="mt-3 rounded-2xl border border-line-subtle bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`rounded-lg p-1.5 ${toneSurfaceClass.info}`}>
            <CalendarDays className={`h-4 w-4 ${toneTextClass.info}`} />
          </div>

          <h4 className="text-sm font-semibold">Upcoming holidays</h4>
        </div>

        <span className="font-mono text-micro-lg tabular-nums text-muted-foreground">
          {holidays.length} scheduled
        </span>
      </div>

      {holidays.length > 0 ? (
        <div className="divide-y divide-border/50">
          {holidays.map((holiday) => (
            <div key={holiday.id} className="py-2 first:pt-1 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{holiday.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(holiday.date), "d MMM, yyyy")}
                  </p>
                </div>
                <Badge variant="secondary" className={`shrink-0 text-xs ${toneSurfaceClass.info}`}>
                  {holiday.is_global ? "Global" : "Workspace"}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-line-subtle p-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Info className="h-4 w-4" />

            <span className="text-xs">No upcoming holidays scheduled.</span>
          </div>
        </div>
      )}
    </div>
  );
};
