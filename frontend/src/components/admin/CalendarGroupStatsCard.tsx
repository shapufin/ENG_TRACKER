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
    <GlassCard isHoverLift={false} className="p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{title}</p>

          <div className="mt-3 flex items-end gap-3">
            <h3 className="text-5xl font-bold tabular-nums">{value}</h3>

            {subtitle && <p className="pb-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </div>

        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Icon className="h-6 w-6 text-primary" />
        </div>
      </div>
    </GlassCard>
  );
};
