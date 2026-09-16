import React from "react";
import { type LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";

interface ActivityItemProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  /** Optional tinted icon well (e.g. "bg-success/10"). Defaults to primary. */
  iconWellClass?: string;
  iconColorClass?: string;
}

export const ActivityItem: React.FC<ActivityItemProps> = ({
  title,
  subtitle,
  icon: Icon,
  iconWellClass = "bg-primary/10",
  iconColorClass = "text-primary",
}) => {
  return (
    <GlassCard className="p-4" isHoverLift={false}>
      <div className="flex items-center gap-4">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            iconWellClass
          )}
        >
          <Icon className={cn("h-5 w-5", iconColorClass)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{title}</div>
          <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
        </div>
      </div>
    </GlassCard>
  );
};
