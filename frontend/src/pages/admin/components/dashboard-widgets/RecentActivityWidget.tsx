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
  <div className="grid gap-4 p-4 lg:grid-cols-2">
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/40" />
    ))}
  </div>
);

export const RecentActivityWidget: React.FC<RecentActivityWidgetProps> = ({
  auditLogs,
  isLoading,
}) => (
  <GlassCard data-testid="recent-activity-widget">
    <div className="border-b border-border/60 p-4">
      <h3 className="text-sm font-semibold">Recent Activity</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">Latest system events</p>
    </div>
    {isLoading ? (
      <ActivitySkeleton />
    ) : auditLogs?.length ? (
      <div className="grid gap-4 p-4 lg:grid-cols-2">
        {auditLogs.map((log) => (
          <ActivityItem
            key={log.id}
            title={log.action}
            subtitle={log.description}
            icon={
              log.action.includes("create")
                ? UserPlus
                : log.action.includes("update")
                  ? ShieldCheck
                  : CheckCircle
            }
          />
        ))}
      </div>
    ) : (
      <div className="py-8 text-center text-muted-foreground">No recent activity</div>
    )}
  </GlassCard>
);
