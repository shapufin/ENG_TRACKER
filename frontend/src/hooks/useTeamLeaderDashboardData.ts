import { useQuery } from "@tanstack/react-query";
import { dashboardService } from "@/services/dashboardService";

interface UseTeamLeaderDashboardDataProps {
  userId?: number;
  teamId?: number;
  shouldQueryTeamData: boolean;
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
}: UseTeamLeaderDashboardDataProps) => {
  const teamKeySuffix = [userId ?? "anonymous", teamId ?? "no-team"] as const;

  const { data: teamStats } = useQuery({
    queryKey: ["dashboard", "team", ...teamKeySuffix],
    queryFn: () => dashboardService.getTeamStats(teamId),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: shouldQueryTeamData,
  });

  const { data: monthlyComparison } = useQuery({
    queryKey: ["dashboard", "monthly_comparison", ...teamKeySuffix],
    queryFn: () => dashboardService.getMonthlyComparison(teamId),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: shouldQueryTeamData,
  });

  const {
    data: topPendingUsers,
    isLoading: isTopPendingUsersLoading,
    isError: isTopPendingUsersError,
  } = useQuery({
    queryKey: ["dashboard", "top_pending_users", ...teamKeySuffix],
    queryFn: () => dashboardService.getTopPendingUsers(teamId, 5),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: shouldQueryTeamData,
  });

  const {
    data: queueHighlights,
    isLoading: isQueueHighlightsLoading,
    isError: isQueueHighlightsError,
  } = useQuery({
    queryKey: ["dashboard", "queue_highlights", ...teamKeySuffix],
    queryFn: () => dashboardService.getQueueHighlights(teamId, 4),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: shouldQueryTeamData,
  });

  return {
    teamStats,
    monthlyComparison,
    topPendingUsers,
    isTopPendingUsersLoading,
    isTopPendingUsersError,
    queueHighlights,
    isQueueHighlightsLoading,
    isQueueHighlightsError,
    isLoading: isTopPendingUsersLoading || isQueueHighlightsLoading,
  };
};
