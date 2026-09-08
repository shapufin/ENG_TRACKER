import React from "react";
import { AdminQuickLinks } from "./AdminQuickLinks";
import { StatsWidgets } from "./dashboard-widgets/StatsWidgets";
import { HoursChartWidget } from "./dashboard-widgets/HoursChartWidget";
import { ApprovalStatusWidget } from "./dashboard-widgets/ApprovalStatusWidget";
import { RecentActivityWidget } from "./dashboard-widgets/RecentActivityWidget";
import { usePluginPermissions } from "@/hooks/usePluginPermissions";

interface AuditLog {
  id: number;
  action: string;
  description: string;
}

interface AdminDashboardWidgetsProps {
  isWidgetActive: (id: string) => boolean;
  totalUsers: number;
  totalTeams: number;
  totalPending: number;
  overtimeSummary?: { total_hours?: number } | null;
  hoursData: { label: string; hours: number }[];
  statusData: { name: string; value: number }[];
  auditLogs?: AuditLog[];
  statsLoading?: boolean;
  auditLogsLoading?: boolean;
}

export const AdminDashboardWidgets: React.FC<AdminDashboardWidgetsProps> = ({
  isWidgetActive,
  totalUsers,
  totalTeams,
  totalPending,
  overtimeSummary,
  hoursData,
  statusData,
  auditLogs,
  statsLoading,
  auditLogsLoading,
}) => {
  // The recent-activity widget reads audit_log data the viewer may not be
  // permitted to see (plugin permission is fail-secure server-side) — hide
  // it instead of firing a guaranteed 403 (audit 2026-09-07).
  const { canView } = usePluginPermissions();
  const canViewAudit = canView("audit_log");

  return (
    <>
      <StatsWidgets
        isWidgetActive={isWidgetActive}
        totalUsers={totalUsers}
        totalTeams={totalTeams}
        totalPending={totalPending}
        overtimeSummary={overtimeSummary}
        isLoading={statsLoading}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {isWidgetActive("hours-overview") && (
          <HoursChartWidget hoursData={hoursData} isLoading={statsLoading} />
        )}
        {isWidgetActive("approval-status") && (
          <ApprovalStatusWidget statusData={statusData} isLoading={statsLoading} />
        )}
      </div>
      <AdminQuickLinks isWidgetActive={isWidgetActive} />
      {isWidgetActive("recent-activity") && canViewAudit && (
        <RecentActivityWidget auditLogs={auditLogs} isLoading={auditLogsLoading} />
      )}
    </>
  );
};
