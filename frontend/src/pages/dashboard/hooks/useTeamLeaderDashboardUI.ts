import { useMemo } from "react";
import type { useTeamLeaderDashboardData } from "@/hooks/useTeamLeaderDashboardData";

type DashboardData = ReturnType<typeof useTeamLeaderDashboardData>;

export const useTeamLeaderDashboardUI = (dashboardData: DashboardData) => {
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

  const uiTopPendingUsers = useMemo(() => {
    if (!dashboardData.topPendingUsers) return [];
    return dashboardData.topPendingUsers.map((u) => ({
      userId: u.user_id,
      userName: u.user_name,
      count: u.pending_count,
    }));
  }, [dashboardData.topPendingUsers]);

  const uiQueueHighlights = useMemo(() => {
    if (!dashboardData.queueHighlights) return [];
    return dashboardData.queueHighlights.map((item) => ({
      id: item.id,
      type: item.type,
      userName: item.user_name,
      date: item.date,
      details: item.details,
      status: item.status,
    }));
  }, [dashboardData.queueHighlights]);

  return { pendingCounts, queueSegments, uiTopPendingUsers, uiQueueHighlights };
};
