import { useQuery } from "@tanstack/react-query";
import { dashboardService } from "@/services/dashboardService";

interface UseTeamLeaderDashboardDataProps {
  userId?: number;
  teamId?: number;
  shouldQueryTeamData: boolean;
  comparisonGranularity?: "week" | "month";
}

/**
 * Custom hook for fetching team leader dashboard data.
 * Centralizes all dashboard queries for team leader view.
 *
 * Extracted from TeamLeaderDashboard to reduce complexity.
 */
export const useTeamLeaderDashboardData = ({
  userId,
  teamId,
  shouldQueryTeamData,
  comparisonGranularity = "month",
}: UseTeamLeaderDashboardDataProps) => {
  const teamKeySuffix = [userId ?? "anonymous", teamId ?? "no-team"] as const;
  // Slow-moving aggregates stay fresh for 30s to avoid a refetch storm on
  // every mount/tab switch; the approval queue itself stays realtime.
  const AGGREGATE_STALE_TIME = 30_000;

  const { data: teamStats } = useQuery({
    queryKey: ["dashboard", "team", ...teamKeySuffix],
    queryFn: () => dashboardService.getTeamStats(teamId),
    refetchOnMount: true,
    staleTime: AGGREGATE_STALE_TIME,
    refetchOnWindowFocus: false,
    enabled: shouldQueryTeamData,
  });

  const { data: pendingTrend } = useQuery({
    queryKey: ["dashboard", "pending_trend", ...teamKeySuffix],
    queryFn: () => dashboardService.getPendingTrend(teamId),
    refetchOnMount: true,
    staleTime: AGGREGATE_STALE_TIME,
    refetchOnWindowFocus: false,
    enabled: shouldQueryTeamData,
  });

  const { data: monthlyComparison } = useQuery({
    queryKey: ["dashboard", "monthly_comparison", ...teamKeySuffix, comparisonGranularity],
    queryFn: () => dashboardService.getMonthlyComparison(teamId, comparisonGranularity),
    refetchOnMount: true,
    staleTime: AGGREGATE_STALE_TIME,
    refetchOnWindowFocus: false,
    enabled: shouldQueryTeamData,
  });

  const {
    data: queueHighlights,
    isLoading: isQueueHighlightsLoading,
    isError: isQueueHighlightsError,
  } = useQuery({
    queryKey: ["dashboard", "queue_highlights", ...teamKeySuffix],
    queryFn: () => dashboardService.getQueueHighlights(teamId, 20),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: shouldQueryTeamData,
  });

  return {
    teamStats,
    pendingTrend,
    monthlyComparison,
    queueHighlights,
    isQueueHighlightsLoading,
    isQueueHighlightsError,
    isLoading: isQueueHighlightsLoading,
  };
};
