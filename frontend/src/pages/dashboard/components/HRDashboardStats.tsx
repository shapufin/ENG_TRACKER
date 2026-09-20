import React from "react";
import { Clock, Users, FileSpreadsheet, Activity } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";

interface HRDashboardStatsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hrStats: any;
}

export const HRDashboardStats: React.FC<HRDashboardStatsProps> = ({ hrStats }) => {
  const avgOvertime = hrStats?.avg_overtime_hours || 0;
  const activeTeams = hrStats?.active_teams_count || 0;
  const totalRequests = (hrStats?.pending_overtime || 0) + (hrStats?.pending_standby || 0);
  const workforce = hrStats?.total_users || 0;

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Avg. Overtime"
        value={`${avgOvertime.toFixed(1)}h`}
        icon={Clock}
        glow="primary"
        trend="+12%"
        progressPercent={Math.min(100, Math.round((avgOvertime / 4) * 100))}
        progressColorClass="bg-primary"
        footer={
          <>
            <span className="font-medium tabular-nums text-muted-foreground">
              {avgOvertime.toFixed(1)}h average
            </span>
            <span className="text-muted-foreground">Company-wide</span>
          </>
        }
      />
      <StatCard
        label="Active Teams"
        value={activeTeams}
        icon={Users}
        glow="success"
        iconColorClass="text-success"
        trend="Stable"
        progressPercent={activeTeams > 0 ? 100 : 0}
        progressColorClass="bg-success"
        footer={
          <>
            <span className="font-medium tabular-nums text-muted-foreground">
              {activeTeams} teams
            </span>
            <span className="text-muted-foreground">Active now</span>
          </>
        }
      />
      <StatCard
        label="Total Requests"
        value={totalRequests}
        icon={FileSpreadsheet}
        glow="warning"
        iconColorClass="text-warning"
        trend="+5"
        progressPercent={
          totalRequests > 0
            ? Math.round(((hrStats?.pending_overtime ?? 0) / totalRequests) * 100)
            : 0
        }
        progressColorClass="bg-warning"
        footer={
          <>
            <span className="font-medium tabular-nums text-muted-foreground">
              {hrStats?.pending_overtime ?? 0} overtime
            </span>
            <span className="tabular-nums text-muted-foreground">
              {hrStats?.pending_standby ?? 0} standby
            </span>
          </>
        }
      />
      <StatCard
        label="Workforce"
        value={workforce}
        icon={Activity}
        glow="destructive"
        iconColorClass="text-destructive"
        trend="+2"
        progressPercent={workforce > 0 ? 100 : 0}
        progressColorClass="bg-success"
        footer={
          <>
            <span className="font-medium tabular-nums text-muted-foreground">
              {workforce} users
            </span>
            <span className="text-muted-foreground">Total headcount</span>
          </>
        }
      />
    </div>
  );
};
