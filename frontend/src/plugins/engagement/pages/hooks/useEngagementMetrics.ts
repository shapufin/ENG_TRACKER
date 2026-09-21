/**
 * useEngagementMetrics — orchestrates the TL engagement metrics page data.
 *
 * React Query keys include `month`/`months` (CONTEXT.md rule #8): the
 * summary and team-breakdown queries are keyed on `month`, trend on
 * `months`.
 */
import { useQuery } from "@tanstack/react-query";
import { engagementService } from "../../services/engagementService";

const TREND_MONTHS = 6;

export const useEngagementMetrics = (month?: string) => {
  const summaryQuery = useQuery({
    queryKey: ["engagement", "summary", month],
    queryFn: () => engagementService.getSummary(month).then((res) => res.data),
    staleTime: 30_000,
  });

  const trendQuery = useQuery({
    queryKey: ["engagement", "trend", TREND_MONTHS],
    queryFn: () => engagementService.getTrend(TREND_MONTHS).then((res) => res.data),
    staleTime: 30_000,
  });

  const teamBreakdownQuery = useQuery({
    queryKey: ["engagement", "team-breakdown", month],
    queryFn: () => engagementService.getTeamBreakdown(month).then((res) => res.data),
    staleTime: 30_000,
  });

  return {
    summary: summaryQuery.data,
    trend: trendQuery.data ?? [],
    teamBreakdown: teamBreakdownQuery.data ?? [],
    isLoading: summaryQuery.isLoading || trendQuery.isLoading || teamBreakdownQuery.isLoading,
    isError: summaryQuery.isError || trendQuery.isError || teamBreakdownQuery.isError,
  };
};
