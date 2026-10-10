import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { usePlugins } from "@/context/PluginContext";
import { usePluginPermissions } from "@/hooks/usePluginPermissions";
import type { ExportJob, ScheduledReport } from "@/lib/analyticsExports";

/**
 * Recent exports and schedules from the analytics plugin. Reads go over REST
 * (no static plugin import) and share cache keys with ReportsPanel and
 * ScheduledReportsPanel.
 */
export function useReportArchive() {
  const { activePlugins } = usePlugins();
  const { canExport, canManage } = usePluginPermissions();
  const active = activePlugins.some((p) => p.name === "analytics");
  const exportsEnabled = active && canExport("analytics");
  const schedulesEnabled = active && canManage("analytics");

  const exportsQuery = useQuery<ExportJob[]>({
    queryKey: ["export-jobs"],
    queryFn: async () => {
      const response = await api.get("plugins/analytics/metrics/export-jobs/");
      return response.data.results || [];
    },
    enabled: exportsEnabled,
  });

  const schedulesQuery = useQuery<ScheduledReport[]>({
    queryKey: ["scheduled-reports"],
    queryFn: async () => {
      const response = await api.get("plugins/analytics/scheduled-reports/");
      return response.data.results || response.data;
    },
    enabled: schedulesEnabled,
  });

  return {
    enabled: exportsEnabled || schedulesEnabled,
    exports: {
      data: exportsQuery.data ?? [],
      isLoading: exportsQuery.isLoading,
      isError: exportsQuery.isError,
      enabled: exportsEnabled,
    },
    schedules: {
      data: schedulesQuery.data ?? [],
      isLoading: schedulesQuery.isLoading,
      isError: schedulesQuery.isError,
      enabled: schedulesEnabled,
    },
  };
}
