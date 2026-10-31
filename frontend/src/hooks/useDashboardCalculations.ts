import { useMemo } from "react";
import {
  buildOvertimeChart,
  buildStandbyChart,
  buildLeaveChart,
  buildRecentActivity,
  sumOvertimeHours,
  sumStandbyHours,
  sumApprovedLeaveDays,
  sumPendingLeaveDays,
} from "@/lib/dashboardCalculations";

export const useDashboardCalculations = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  overtimeResults: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  standbyResults: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  leaveResults: any[]
) => ({
  overtimeChart: useMemo(() => buildOvertimeChart(overtimeResults), [overtimeResults]),
  standbyChart: useMemo(() => buildStandbyChart(standbyResults), [standbyResults]),
  leaveChart: useMemo(() => buildLeaveChart(leaveResults), [leaveResults]),
  recentActivity: useMemo(
    () => buildRecentActivity(overtimeResults, standbyResults, leaveResults),
    [overtimeResults, standbyResults, leaveResults]
  ),
  personalOvertimeHours: useMemo(() => sumOvertimeHours(overtimeResults), [overtimeResults]),
  personalStandbyHours: useMemo(() => sumStandbyHours(standbyResults), [standbyResults]),
  approvedLeaveDays: useMemo(() => sumApprovedLeaveDays(leaveResults), [leaveResults]),
  pendingLeaveDays: useMemo(() => sumPendingLeaveDays(leaveResults), [leaveResults]),
});
