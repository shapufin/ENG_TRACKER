import { useQuery } from "@tanstack/react-query";
import { dashboardService } from "@/services/dashboardService";
import { FRESH_MS } from "@/lib/queryFreshness";

interface UseTeamLeaderDashboardDataProps {
  userId?: number;
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
  shouldQueryTeamData,
  comparisonGranularity = "month",
}: UseTeamLeaderDashboardDataProps) => {
  // No team_id here: it would narrow the API to one team and drop linked reports in others.
  const viewerKey = userId ?? "anonymous";
  // Other people's new requests appear on window focus once the data is FRESH_MS old
  // (item 93); the approval queue itself is never considered fresh.

  const { data: teamStats } = useQuery({
    queryKey: ["dashboard", "team", viewerKey],
    queryFn: () => dashboardService.getTeamStats(),
    refetchOnMount: true,
    staleTime: FRESH_MS,
    refetchOnWindowFocus: true,
    enabled: shouldQueryTeamData,
  });

  const { data: pendingTrend } = useQuery({
    queryKey: ["dashboard", "pending_trend", viewerKey],
    queryFn: () => dashboardService.getPendingTrend(),
    refetchOnMount: true,
    staleTime: FRESH_MS,
    refetchOnWindowFocus: true,
    enabled: shouldQueryTeamData,
  });

  const { data: monthlyComparison } = useQuery({
    queryKey: ["dashboard", "monthly_comparison", viewerKey, comparisonGranularity],
    queryFn: () => dashboardService.getMonthlyComparison(undefined, comparisonGranularity),
    refetchOnMount: true,
    staleTime: FRESH_MS,
    refetchOnWindowFocus: true,
    enabled: shouldQueryTeamData,
  });

  const {
    data: queueHighlights,
    isLoading: isQueueHighlightsLoading,
    isError: isQueueHighlightsError,
  } = useQuery({
    queryKey: ["dashboard", "queue_highlights", viewerKey],
    queryFn: () => dashboardService.getQueueHighlights(undefined, 20),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: true,
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
