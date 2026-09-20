import { useMemo } from "react";
import type { useTeamLeaderDashboardData } from "@/hooks/useTeamLeaderDashboardData";

type DashboardData = ReturnType<typeof useTeamLeaderDashboardData>;

export type HighlightFilter = "all" | "overtime" | "standby" | "leave";
export type HighlightSort = "recent" | "oldest";

interface UseTeamLeaderDashboardUIOptions {
  highlightFilter?: HighlightFilter;
  highlightSort?: HighlightSort;
}

export const useTeamLeaderDashboardUI = (
  dashboardData: DashboardData,
  { highlightFilter = "all", highlightSort = "recent" }: UseTeamLeaderDashboardUIOptions = {}
) => {
  const pendingCounts = useMemo(() => {
    if (!dashboardData.teamStats) return { overtime: 0, standby: 0, leave: 0, total: 0 };
    const overtime = dashboardData.teamStats.pending_team_overtime ?? 0;
    const standby = dashboardData.teamStats.pending_team_standby ?? 0;
    const leave = dashboardData.teamStats.pending_team_leaves ?? 0;
    return { overtime, standby, leave, total: overtime + standby + leave };
  }, [dashboardData.teamStats]);

  const queueSegments = useMemo(
    () => [
      {
        label: "Overtime",
        value: pendingCounts.overtime,
        percentage:
          pendingCounts.total > 0
            ? Math.round((pendingCounts.overtime / pendingCounts.total) * 100)
            : 0,
        accent: "bg-primary",
      },
      {
        label: "Standby",
        value: pendingCounts.standby,
        percentage:
          pendingCounts.total > 0
            ? Math.round((pendingCounts.standby / pendingCounts.total) * 100)
            : 0,
        accent: "bg-warning",
      },
      {
        label: "Leave",
        value: pendingCounts.leave,
        percentage:
          pendingCounts.total > 0
            ? Math.round((pendingCounts.leave / pendingCounts.total) * 100)
            : 0,
        accent: "bg-success",
      },
    ],
    [pendingCounts]
  );

  const uiQueueHighlights = useMemo(() => {
    if (!dashboardData.queueHighlights) return [];
    return dashboardData.queueHighlights.map((item) => ({
      id: item.id,
      type: item.type,
      userName: item.user_name,
      date: item.date,
      details: item.details,
      status: item.status,
      tag: item.tag ?? null,
      hours: item.hours ?? null,
      days: item.days ?? null,
    }));
  }, [dashboardData.queueHighlights]);

  const highlightTypeCounts = useMemo(() => {
    const pending = uiQueueHighlights.filter((item) => item.status === "pending");
    return {
      all: pending.length,
      overtime: pending.filter((item) => item.type === "overtime").length,
      standby: pending.filter((item) => item.type === "standby").length,
      leave: pending.filter((item) => item.type === "leave").length,
    };
  }, [uiQueueHighlights]);

  const filteredSortedHighlights = useMemo(() => {
    const filtered =
      highlightFilter === "all"
        ? uiQueueHighlights
        : uiQueueHighlights.filter((item) => item.type === highlightFilter);
    return [...filtered].sort((a, b) => {
      const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
      return highlightSort === "recent" ? -diff : diff;
    });
  }, [uiQueueHighlights, highlightFilter, highlightSort]);

  return {
    pendingCounts,
    queueSegments,
    uiQueueHighlights,
    highlightTypeCounts,
    filteredSortedHighlights,
  };
};
