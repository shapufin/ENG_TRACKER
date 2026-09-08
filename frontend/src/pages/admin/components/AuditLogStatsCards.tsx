import React from "react";
import { StatCard } from "@/components/ui/StatCard";
import { Clock, User, AlertCircle } from "lucide-react";

interface AuditLogStats {
  total_logs?: number;
  logs_today?: number;
  unique_users?: number;
  failed_actions?: number;
}

interface AuditLogStatsCardsProps {
  stats?: AuditLogStats | null;
  isLoading?: boolean;
}

const StatSkeleton: React.FC = () => (
  <div className="h-8 w-16 animate-pulse rounded bg-muted" aria-hidden="true" />
);

export const AuditLogStatsCards: React.FC<AuditLogStatsCardsProps> = ({ stats, isLoading }) => (
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <StatCard
      label="Total Logs"
      value={isLoading ? <StatSkeleton /> : (stats?.total_logs?.toLocaleString() ?? 0)}
      icon={Clock}
      glow="primary"
      delay={0}
    />
    <StatCard
      label="Today"
      value={isLoading ? <StatSkeleton /> : (stats?.logs_today ?? 0)}
      icon={Clock}
      glow="primary"
      delay={0.05}
    />
    <StatCard
      label="Unique Users"
      value={isLoading ? <StatSkeleton /> : (stats?.unique_users ?? 0)}
      icon={User}
      glow="primary"
      delay={0.1}
    />
    <StatCard
      label="Failed Actions"
      value={isLoading ? <StatSkeleton /> : (stats?.failed_actions ?? 0)}
      icon={AlertCircle}
      glow="warning"
      iconColorClass="text-warning"
      delay={0.15}
    />
  </div>
);
