import { useMemo } from "react";
import type { OvertimeLog, StandbyLog, LeaveRequest } from "@/types";

const PERSONAL_OVERTIME_TARGET = 40;
const PERSONAL_LEAVE_TARGET = 20;

interface DashboardData {
  overtimeData?: { results?: OvertimeLog[] };
  standbyData?: { results?: StandbyLog[] };
  leaveData?: { results?: LeaveRequest[] };
  personalOvertimeHours: number;
  approvedLeaveDays: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recentActivity: any[];
}

export const usePersonalDashboardItems = ({
  overtimeData,
  standbyData,
  leaveData,
  personalOvertimeHours,
  approvedLeaveDays,
  recentActivity,
}: DashboardData) => {
  const overtimeGoalProgress = (personalOvertimeHours / PERSONAL_OVERTIME_TARGET) * 100;
  const leaveGoalProgress = (approvedLeaveDays / PERSONAL_LEAVE_TARGET) * 100;

  const personalTimelineItems = useMemo(() => recentActivity.slice(0, 5), [recentActivity]);

  const upcomingLeaves = useMemo(
    () =>
      (leaveData?.results ?? [])
        .filter((r: LeaveRequest) => r.status === "approved" || r.status === "pending")
        .slice(0, 3),
    [leaveData]
  );

  const personalPendingItems = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = [];
    (overtimeData?.results ?? [])
      .filter((r: OvertimeLog) => r.status === "pending")
      .forEach((r: OvertimeLog) =>
        items.push({
          id: `ot-${r.id}`,
          label: "Overtime Request",
          amount: `${r.hours}h`,
          date: r.date,
          status: "pending",
        })
      );
    (standbyData?.results ?? [])
      .filter((r: StandbyLog) => r.status === "pending")
      .forEach((r: StandbyLog) =>
        items.push({
          id: `sb-${r.id}`,
          label: "Standby Request",
          amount: `${r.hours}h`,
          date: r.date,
          status: "pending",
        })
      );
    (leaveData?.results ?? [])
      .filter((r: LeaveRequest) => r.status === "pending")
      .forEach((r: LeaveRequest) =>
        items.push({
          id: `leave-${r.id}`,
          label: "Leave Request",
          amount: `${r.days_requested}d`,
          date: r.start_date,
          status: "pending",
        })
      );
    return items.slice(0, 4);
  }, [overtimeData, standbyData, leaveData]);

  return {
    overtimeGoalProgress,
    leaveGoalProgress,
    personalTimelineItems,
    upcomingLeaves,
    personalPendingItems,
  };
};
