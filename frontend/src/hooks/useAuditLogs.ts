import React from "react";
import { useQuery } from "@tanstack/react-query";
import { auditService, type AuditLogStats } from "@/services/auditService";

interface UseAuditLogsOptions {
  filterAction: string;
  filterModel: string;
  searchQuery: string;
}

const EMPTY_STATS: AuditLogStats = {
  total_logs: 0,
  logs_today: 0,
  logs_this_week: 0,
  logs_this_month: 0,
  unique_users: 0,
  failed_actions: 0,
  success_rate: 100,
};

/**
 * Custom hook for audit log queries and statistics.
 *
 * Stats are aggregated server-side via the /reports/audit-logs/stats/
 * endpoint over the full filtered queryset — not the page-limited
 * ``results`` array. This fixes the data-correctness bug where stats
 * cards reflected only the first 100 rows of the filtered set.
 */
export const useAuditLogs = ({ filterAction, filterModel, searchQuery }: UseAuditLogsOptions) => {
  const { data: logsData, isLoading } = useQuery({
    queryKey: ["audit-logs", filterAction, filterModel, searchQuery],
    queryFn: () =>
      auditService.getLogs({
        action: filterAction === "all" ? undefined : filterAction,
        model_name: filterModel === "all" ? undefined : filterModel,
        search: searchQuery || undefined,
        page_size: 100,
      }),
    staleTime: 2 * 60 * 1000,
  });

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ["audit-logs", "stats", filterAction, filterModel, searchQuery],
    queryFn: () =>
      auditService.getStats({
        action: filterAction === "all" ? undefined : filterAction,
        model_name: filterModel === "all" ? undefined : filterModel,
        search: searchQuery || undefined,
      }),
    staleTime: 2 * 60 * 1000,
  });

  const logs = React.useMemo(() => logsData?.results || [], [logsData?.results]);
  const stats = statsData ?? EMPTY_STATS;

  return {
    logs,
    isLoading,
    stats,
    statsLoading,
  };
};
