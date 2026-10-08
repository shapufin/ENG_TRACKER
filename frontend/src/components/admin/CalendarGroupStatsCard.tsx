import React from "react";
import type { LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

interface CalendarGroupStatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
}

export const CalendarGroupStatsCard: React.FC<CalendarGroupStatsCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
}) => {
  return (
    <GlassCard className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-muted-foreground text-[11px] tracking-[0.18em] uppercase">{title}</p>

          <div className="mt-1.5 flex items-end gap-2">
            <h3 className="font-mono text-2xl font-bold tabular-nums">{value}</h3>

            {subtitle && <p className="text-muted-foreground pb-0.5 text-xs">{subtitle}</p>}
          </div>
        </div>

        <div className="bg-primary/10 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
          <Icon className="text-primary h-4 w-4" />
        </div>
      </div>
    </GlassCard>
  );
};
