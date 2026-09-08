import { useQuery } from "@tanstack/react-query";
import { dashboardService } from "@/services/dashboardService";
import { auditLogService } from "@/services/auditLogService";
import { usePluginPermissions } from "@/hooks/usePluginPermissions";
import { computeAdminDashboardSummary } from "./adminDashboardSummary";

export const useAdminDashboardQueries = () => {
  const { canView } = usePluginPermissions();
  const canViewAudit = canView("audit_log");

  const { data: globalStats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin", "global-stats"],
    queryFn: dashboardService.getHRStats,
    staleTime: 5 * 60 * 1000,
  });
  const { data: auditLogs, isLoading: auditLogsLoading } = useQuery({
    queryKey: ["admin", "audit-logs"],
    queryFn: () => auditLogService.getRecentLogs(4),
    staleTime: 5 * 60 * 1000,
    // The audit_log endpoint is fail-secure (403 without the plugin view
    // permission) — don't fire the query for users who can't view it.
    enabled: canViewAudit,
  });

  return {
    ...computeAdminDashboardSummary(globalStats),
    statsLoading,
    auditLogs,
    auditLogsLoading,
  };
};
