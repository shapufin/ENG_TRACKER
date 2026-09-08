import React from "react";
import { format, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";

interface WeekViewDayHeaderProps {
  days: Date[];
}

export const WeekViewDayHeader: React.FC<WeekViewDayHeaderProps> = ({ days }) => (
  <div className="grid grid-cols-[240px_repeat(7,minmax(0,1fr))] border-b border-border/70 bg-surface-sunken">
    <div className="border-r border-border/60 px-5 py-3" />
    {days.map((day) => (
      <div
        key={day.toISOString()}
        className="border-r border-border/60 px-4 py-3 text-center last:border-r-0"
      >
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {format(day, "EEE")}
        </p>
        <h3
          className={cn(
            "mt-1 text-lg font-semibold",
            isSameDay(day, new Date()) && "text-blue-700 dark:text-blue-400"
          )}
        >
          {format(day, "d")}
        </h3>
      </div>
    ))}
  </div>
);
