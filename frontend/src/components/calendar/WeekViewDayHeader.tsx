import React from "react";
import { format, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";

interface WeekViewDayHeaderProps {
  days: Date[];
}

export const WeekViewDayHeader: React.FC<WeekViewDayHeaderProps> = ({ days }) => (
  <div className="border-border/70 bg-surface-sunken grid grid-cols-[240px_repeat(7,minmax(0,1fr))] border-b">
    <div className="border-border/60 border-r px-5 py-3" />
    {days.map((day) => (
      <div
        key={day.toISOString()}
        className="border-border/60 border-r px-4 py-3 text-center last:border-r-0"
      >
        <p className="text-muted-foreground text-xs tracking-[0.3em] uppercase">
          {format(day, "EEE")}
        </p>
        <h3
          className={cn(
            "mt-1 text-lg font-semibold",
            isSameDay(day, new Date()) && "text-tone-info-text"
          )}
        >
          {format(day, "d")}
        </h3>
      </div>
    ))}
  </div>
);
