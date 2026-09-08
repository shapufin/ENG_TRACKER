import React from "react";
import { type LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

interface ActivityItemProps {
  title: string;
  subtitle: string;
  icon: LucideIcon;
}

export const ActivityItem: React.FC<ActivityItemProps> = ({ title, subtitle, icon: Icon }) => {
  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{title}</div>
          <div className="text-sm text-muted-foreground">{subtitle}</div>
        </div>
      </div>
    </GlassCard>
  );
};
