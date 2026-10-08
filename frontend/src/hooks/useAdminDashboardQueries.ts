import { useQuery } from "@tanstack/react-query";
import { dashboardService } from "@/services/dashboardService";
import { auditLogService } from "@/services/auditLogService";
import { usePluginPermissions } from "@/hooks/usePluginPermissions";
import { computeAdminDashboardSummary } from "./adminDashboardSummary";

/** One request feeds every overview widget; it only fires while one is enabled. */
export const useAdminOverview = (enabled: boolean) =>
  useQuery({
    queryKey: ["admin", "overview"],
    queryFn: dashboardService.getAdminOverview,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled,
  });

/** Same staleness policy as the overview; fires only while a trends widget is on. */
export const useAdminTrends = (enabled: boolean) =>
  useQuery({
    queryKey: ["admin", "trends"],
    queryFn: dashboardService.getAdminTrends,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled,
  });

export const useAdminPeople = (enabled: boolean) =>
  useQuery({
    queryKey: ["admin", "people"],
    queryFn: dashboardService.getAdminPeople,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled,
  });

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
