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
  buildMonthlyData,
  buildStatusBars,
  buildOvertimeTable,
  buildStandbyTable,
} from "@/lib/dashboardCalculations";

export const useDashboardCalculations = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  overtimeResults: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  standbyResults: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  leaveResults: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hrStats: any
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
  monthlyData: useMemo(() => buildMonthlyData(overtimeResults), [overtimeResults]),
  statusBars: useMemo(
    () => buildStatusBars(hrStats, overtimeResults, standbyResults, leaveResults),
    [hrStats, overtimeResults, standbyResults, leaveResults]
  ),
  recentOvertimeTable: useMemo(() => buildOvertimeTable(overtimeResults), [overtimeResults]),
  recentStandbyTable: useMemo(() => buildStandbyTable(standbyResults), [standbyResults]),
});
