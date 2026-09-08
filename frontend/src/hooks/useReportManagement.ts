import { useQuery } from "@tanstack/react-query";
import { reportService } from "@/services/reportService";
import { userService } from "@/services/userService";

interface UseReportManagementOptions {
  start_date: string;
  end_date: string;
  activeTab: "overtime_standby" | "vacation";
  workspace_ids?: string;
  groupBy: "user" | "month" | "year";
}

/**
 * Custom hook for report data fetching and management.
 * Centralizes all report-related queries.
 *
 * Extracted from ReportsPage to reduce complexity.
 */
export const useReportManagement = ({
  start_date,
  end_date,
  activeTab,
  workspace_ids,
  groupBy,
}: UseReportManagementOptions) => {
  const currentType: "combined" | "leave" = activeTab === "overtime_standby" ? "combined" : "leave";

  const { data: teams } = useQuery({
    queryKey: ["admin", "teams"],
    queryFn: () => userService.getTeams(),
  });

  const {
    data: summaryData,
    isLoading: summaryLoading,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ["reports", "summary", start_date, end_date, currentType, workspace_ids],
    queryFn: () =>
      reportService.getSummary({
        start_date,
        end_date,
        report_type: currentType,
        workspace_ids,
      }),
    enabled: false,
  });

  const {
    data: detailedData,
    isLoading: detailedLoading,
    refetch: refetchDetailed,
  } = useQuery({
    queryKey: ["reports", "detailed", start_date, end_date, currentType, groupBy, workspace_ids],
    queryFn: () =>
      reportService.getDetailed({
        start_date,
        end_date,
        report_type: currentType,
        group_by: groupBy,
        workspace_ids,
      }),
    enabled: false,
  });

  const handleGenerate = async () => {
    await Promise.all([refetchSummary(), refetchDetailed()]);
  };

  return {
    teams: teams?.results ?? [],
    summaryData,
    summaryLoading,
    detailedData,
    detailedLoading,
    onGenerate: handleGenerate,
  };
};
