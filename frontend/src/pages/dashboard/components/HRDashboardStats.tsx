import React from "react";
import { Clock, Users, FileSpreadsheet, Activity } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import type { DashboardStats } from "@/types";

interface HRDashboardStatsProps {
  /** Partial because the view renders before `hr_overview` has answered. */
  hrStats: Partial<DashboardStats> | undefined;
}

export const HRDashboardStats: React.FC<HRDashboardStatsProps> = ({ hrStats }) => {
  const avgOvertime = hrStats?.avg_overtime_hours || 0;
  const activeTeams = hrStats?.active_teams_count || 0;
  const pendingOvertime = hrStats?.pending_overtime ?? 0;
  const pendingStandby = hrStats?.pending_standby ?? 0;
  const pendingLeave = hrStats?.pending_leaves ?? 0;
  // Everything waiting for a decision: the same figure as "Pending" in the request pipeline.
  const pendingRequests = pendingOvertime + pendingStandby + pendingLeave;
  // Active accounts, matching the admin dashboard's KPI (inactive accounts
  // would inflate headcount; the API sends both counts).
  const workforce = hrStats?.active_users ?? hrStats?.total_users ?? 0;

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Avg. Overtime"
        value={`${avgOvertime.toFixed(1)}h`}
        icon={Clock}
        glow="primary"
        footer={
          <>
            <span className="font-medium tabular-nums text-muted-foreground">
              {avgOvertime.toFixed(1)}h average
            </span>
            <span className="text-muted-foreground">This month</span>
          </>
        }
      />
      <StatCard
        label="Active Teams"
        value={activeTeams}
        icon={Users}
        glow="success"
        iconColorClass="text-success"
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
        label="Pending Requests"
        value={pendingRequests}
        icon={FileSpreadsheet}
        glow="warning"
        iconColorClass="text-warning"
        progressPercent={
          pendingRequests > 0 ? Math.round((pendingOvertime / pendingRequests) * 100) : 0
        }
        progressColorClass="bg-warning"
        footer={
          // Three labels do not fit one row in a narrow (lg) card: wrap them as a group,
          // each label kept whole.
          <span className="flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums text-muted-foreground">
            <span className="whitespace-nowrap font-medium">{pendingOvertime} overtime</span>
            <span className="whitespace-nowrap">{pendingStandby} standby</span>
            <span className="whitespace-nowrap">{pendingLeave} leave</span>
          </span>
        }
      />
      <StatCard
        label="Workforce"
        value={workforce}
        icon={Activity}
        glow="destructive"
        iconColorClass="text-destructive"
        footer={
          <>
            <span className="font-medium tabular-nums text-muted-foreground">
              {workforce} users
            </span>
            <span className="text-muted-foreground">Active headcount</span>
          </>
        }
      />
    </div>
  );
};
