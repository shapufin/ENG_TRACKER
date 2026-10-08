import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { ActivityItem } from "@/components/dashboard/ActivityItem";
import { CheckCircle, UserPlus, ShieldCheck } from "lucide-react";

interface AuditLog {
  id: number;
  action: string;
  description: string;
}

interface RecentActivityWidgetProps {
  auditLogs?: AuditLog[];
  isLoading?: boolean;
}

const ActivitySkeleton: React.FC = () => (
  <div className="grid gap-4 p-5 lg:grid-cols-2">
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="bg-muted/40 h-16 animate-pulse rounded-xl" />
    ))}
  </div>
);

/** Icon + tone per audit action, so create/update/other events read at a
 * glance instead of sharing one flat primary-tinted well. */
const activityVisual = (action: string) => {
  if (action.includes("create")) {
    return { icon: UserPlus, iconWellClass: "bg-success/10", iconColorClass: "text-success" };
  }
  if (action.includes("update")) {
    return { icon: ShieldCheck, iconWellClass: "bg-primary/10", iconColorClass: "text-primary" };
  }
  return { icon: CheckCircle, iconWellClass: "bg-warning/10", iconColorClass: "text-warning" };
};

export const RecentActivityWidget: React.FC<RecentActivityWidgetProps> = ({
  auditLogs,
  isLoading,
}) => (
  <GlassCard data-testid="recent-activity-widget">
    <div className="border-border/60 border-b px-5 py-4">
      <h3 className="text-sm font-semibold tracking-tight">Recent Activity</h3>
      <p className="text-muted-foreground mt-1 text-xs">Latest system events</p>
    </div>
    {isLoading ? (
      <ActivitySkeleton />
    ) : auditLogs?.length ? (
      <div className="grid gap-4 p-5 lg:grid-cols-2">
        {auditLogs.map((log) => {
          const { icon, iconWellClass, iconColorClass } = activityVisual(log.action);
          return (
            <ActivityItem
              key={log.id}
              title={log.action}
              subtitle={log.description}
              icon={icon}
              iconWellClass={iconWellClass}
              iconColorClass={iconColorClass}
            />
          );
        })}
      </div>
    ) : (
      <div className="text-muted-foreground py-8 text-center text-sm">No recent activity</div>
    )}
  </GlassCard>
);
