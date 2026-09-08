import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";

interface CalendarGroup {
  calendar_group: string;
  team_count: number;
}

interface CalendarGroupsSummaryProps {
  groups: CalendarGroup[] | undefined;
}

export const CalendarGroupsSummary: React.FC<CalendarGroupsSummaryProps> = ({ groups }) => {
  if (!groups || groups.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {groups.map((g) => (
        <GlassCard key={g.calendar_group} delay={0} className="p-3">
          <div className="text-xs uppercase text-muted-foreground">Calendar Group</div>
          <div className="text-lg font-bold">{g.calendar_group}</div>
          <div className="text-xs text-muted-foreground">
            {g.team_count} team{g.team_count !== 1 ? "s" : ""} sharing
          </div>
        </GlassCard>
      ))}
    </div>
  );
};
