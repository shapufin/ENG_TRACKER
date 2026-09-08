import React from "react";
import { StatCard } from "@/components/ui/StatCard";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Users, Building2, AlertCircle, Clock } from "lucide-react";

interface StatsWidgetsProps {
  isWidgetActive: (id: string) => boolean;
  totalUsers: number;
  totalTeams: number;
  totalPending: number;
  overtimeSummary?: { total_hours?: number } | null;
  isLoading?: boolean;
}

const SKELETON_COUNT = 4;

const StatsSkeleton: React.FC = () => (
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
      <div key={i} className="h-24 animate-pulse rounded-xl border border-border/70 bg-card" />
    ))}
  </div>
);

export const StatsWidgets: React.FC<StatsWidgetsProps> = ({
  isWidgetActive,
  totalUsers,
  totalTeams,
  totalPending,
  overtimeSummary,
  isLoading,
}) => {
  if (isLoading) return <StatsSkeleton />;

  const overtimeHours = overtimeSummary?.total_hours ?? 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {isWidgetActive("total-users") && (
        <StatCard label="Total Users" value={totalUsers} icon={Users} glow="primary" delay={0} />
      )}
      {isWidgetActive("total-teams") && (
        <StatCard
          label="Total Teams"
          value={totalTeams}
          icon={Building2}
          glow="success"
          iconColorClass="text-success"
          delay={0.05}
        />
      )}
      {isWidgetActive("pending-approvals") && (
        <StatCard
          label="Pending Approvals"
          value={totalPending}
          icon={AlertCircle}
          glow="warning"
          iconColorClass="text-warning"
          delay={0.1}
          trend={totalPending === 0 ? "No pending items" : `${totalPending} pending`}
        />
      )}
      {isWidgetActive("overtime-hours") && (
        <StatCard
          label="Overtime Hours"
          value={<AnimatedNumber value={overtimeHours} suffix="h" />}
          icon={Clock}
          glow="primary"
          delay={0.15}
          trend={`${overtimeHours}h this month`}
        />
      )}
    </div>
  );
};
