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
    <GlassCard isHoverLift={false} className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{title}</p>

          <div className="mt-1.5 flex items-end gap-2">
            <h3 className="font-mono text-2xl font-bold tabular-nums">{value}</h3>

            {subtitle && <p className="pb-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>

        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </div>
    </GlassCard>
  );
};
