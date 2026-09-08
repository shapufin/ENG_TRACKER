import React from "react";
import { Badge } from "@/components/ui/badge";
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
    <div className="mt-5 rounded-3xl border border-line-subtle bg-surface-sunken p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-indigo-500/10 p-2">
            <CalendarDays className="h-4 w-4 text-indigo-400" />
          </div>

          <h4 className="text-lg font-semibold">Upcoming holidays</h4>
        </div>

        <span className="text-xs text-muted-foreground">{holidays.length} scheduled</span>
      </div>

      {holidays.length > 0 ? (
        <div className="space-y-2">
          {holidays.map((holiday) => (
            <div
              key={holiday.id}
              className="rounded-2xl border border-line-subtle bg-surface-sunken p-2"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground dark:text-white">
                    {holiday.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(holiday.date), "d MMM, yyyy")}
                  </p>
                </div>
                <Badge variant="secondary" className="bg-sky-500/15 text-xs text-sky-300">
                  {holiday.is_global ? "Global" : "Workspace"}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-line-subtle bg-surface-sunken p-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Info className="h-4 w-4" />

            <span className="text-xs">No upcoming holidays scheduled.</span>
          </div>
        </div>
      )}
    </div>
  );
};
