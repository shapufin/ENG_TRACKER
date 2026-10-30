import { useQuery } from "@tanstack/react-query";
import { dashboardService } from "@/services/dashboardService";
import { auditLogService } from "@/services/auditLogService";
import { usePluginPermissions } from "@/hooks/usePluginPermissions";
import { computeAdminDashboardSummary } from "./adminDashboardSummary";

/**
 * The headline figures change from other people's actions (a TL approving), which an
 * open admin tab never sees. Unlike the app-wide `refetchOnWindowFocus: false` default,
 * these refetch on refocus once a minute old.
 */
const FRESH_MS = 60 * 1000;

/** One request feeds every overview widget; it only fires while one is enabled. */
export const useAdminOverview = (enabled: boolean) =>
  useQuery({
    queryKey: ["admin", "overview"],
    queryFn: dashboardService.getAdminOverview,
    staleTime: FRESH_MS,
    refetchOnWindowFocus: true,
    enabled,
  });

/** Same freshness policy as the overview; fires only while a trends widget is on. */
export const useAdminTrends = (enabled: boolean, months = 12) =>
  useQuery({
    // months is part of the key; ["admin","trends"] still prefix-matches for invalidation.
    queryKey: ["admin", "trends", months],
    queryFn: () => dashboardService.getAdminTrends(months),
    staleTime: FRESH_MS,
    refetchOnWindowFocus: true,
    enabled,
  });

export const useAdminPeople = (enabled: boolean) =>
  useQuery({
    queryKey: ["admin", "people"],
    queryFn: dashboardService.getAdminPeople,
    staleTime: FRESH_MS,
    refetchOnWindowFocus: true,
    enabled,
  });

export const useAdminDashboardQueries = () => {
  const { canView } = usePluginPermissions();
  const canViewAudit = canView("audit_log");

  const { data: globalStats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin", "global-stats"],
    queryFn: dashboardService.getHRStats,
    staleTime: FRESH_MS,
    refetchOnWindowFocus: true,
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
