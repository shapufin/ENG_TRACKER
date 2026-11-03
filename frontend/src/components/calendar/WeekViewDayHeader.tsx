import React from "react";
import { format, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";
import { businessToday } from "@/lib/date-format-utils";
import type { DayConflict } from "@/lib/calendarCoverage";
import { ConflictBadge } from "./ConflictBadge";

interface WeekViewDayHeaderProps {
  days: Date[];
  /** Staffing conflicts keyed by yyyy-MM-dd. */
  conflictsByDate?: ReadonlyMap<string, DayConflict>;
}

export const WeekViewDayHeader: React.FC<WeekViewDayHeaderProps> = ({ days, conflictsByDate }) => (
  <div className="border-border/70 bg-surface-sunken grid grid-cols-[240px_repeat(7,minmax(0,1fr))] border-b">
    <div className="border-border/60 border-r px-5 py-3" />
    {days.map((day) => {
      const conflict = conflictsByDate?.get(format(day, "yyyy-MM-dd"));
      return (
        <div
          key={day.toISOString()}
          className={cn(
            "border-border/60 border-r px-4 py-3 text-center last:border-r-0",
            conflict && "border-tone-warning-border border-2"
          )}
        >
          <p className="text-muted-foreground text-xs tracking-[0.3em] uppercase">
            {format(day, "EEE")}
          </p>
          <h3
            className={cn(
              "mt-1 text-lg font-semibold",
              isSameDay(day, businessToday()) && "text-tone-info-text"
            )}
          >
            {format(day, "d")}
          </h3>
          {conflict && (
            <div className="mt-1 flex justify-center">
              <ConflictBadge conflict={conflict} />
            </div>
          )}
        </div>
      );
    })}
  </div>
);
