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
import type { LeaveRequest, OvertimeLog, StandbyLog } from "@/types";

export const useDashboardCalculations = (
  overtimeResults: OvertimeLog[],
  standbyResults: StandbyLog[],
  leaveResults: LeaveRequest[]
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
