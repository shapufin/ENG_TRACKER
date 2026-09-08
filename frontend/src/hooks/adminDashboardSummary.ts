import type { DashboardStats } from "@/types";

const EMPTY_STATS: DashboardStats = {
  total_users: 0,
  total_overtime_hours: 0,
  total_standby_hours: 0,
  pending_overtime: 0,
  approved_overtime: 0,
  rejected_overtime: 0,
  pending_standby: 0,
  approved_standby: 0,
  rejected_standby: 0,
  pending_leaves: 0,
  approved_leaves: 0,
  rejected_leaves: 0,
  avg_overtime_hours: 0,
  active_teams_count: 0,
};

export const computeAdminDashboardSummary = (globalStats?: DashboardStats) => {
  const stats = globalStats ?? EMPTY_STATS;
  const totalPending = stats.pending_overtime + stats.pending_standby + stats.pending_leaves;
  const approvedCount = stats.approved_overtime + stats.approved_standby + stats.approved_leaves;
  const rejectedCount = stats.rejected_overtime + stats.rejected_standby + stats.rejected_leaves;

  return {
    totalUsers: stats.total_users,
    totalTeams: stats.active_teams_count,
    totalPending,
    overtimeSummary: { total_hours: stats.total_overtime_hours },
    statusData: [
      { name: "Pending OT", value: stats.pending_overtime },
      { name: "Pending SB", value: stats.pending_standby },
      { name: "Pending Leave", value: stats.pending_leaves },
      { name: "Approved", value: approvedCount },
      { name: "Rejected", value: rejectedCount },
    ],
    hoursData: [
      { label: "Overtime", hours: Number(stats.total_overtime_hours) },
      { label: "Standby", hours: Number(stats.total_standby_hours) },
    ],
  };
};
