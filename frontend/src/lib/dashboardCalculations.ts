import { buildStatusChart } from "./statusAggregation";
import type { OvertimeLog, StandbyLog, LeaveRequest } from "@/types";

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export const buildOvertimeChart = (results?: OvertimeLog[]) => buildStatusChart(results, COLORS);
export const buildStandbyChart = (results?: StandbyLog[]) => buildStatusChart(results, COLORS);
export const buildLeaveChart = (results?: LeaveRequest[]) => buildStatusChart(results, COLORS);

export const buildRecentActivity = (
  overtime: OvertimeLog[] = [],
  standby: StandbyLog[] = [],
  leave: LeaveRequest[] = []
) => {
  const items = [
    ...overtime.slice(0, 3).map((r) => ({
      id: `ot-${r.id}`,
      user: r.user_name || String(r.user),
      action: "submitted overtime of",
      target: `${r.hours}h`,
      timestamp: r.created_at,
      status: r.status,
    })),
    ...standby.slice(0, 3).map((r) => ({
      id: `sb-${r.id}`,
      user: r.user_name || String(r.user),
      action: "submitted standby of",
      target: `${r.hours}h`,
      timestamp: r.created_at,
      status: r.status,
    })),
    ...leave.slice(0, 3).map((r) => ({
      id: `leave-${r.id}`,
      user: r.user_name || String(r.user),
      action: "requested vacation",
      target: `${r.days_requested}d`,
      timestamp: r.created_at,
      status: r.status,
    })),
  ];
  return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

export const sumOvertimeHours = (results: OvertimeLog[] = []) =>
  results.reduce((acc, r) => acc + (Number(r.hours) || 0), 0);

export const sumStandbyHours = (results: StandbyLog[] = []) =>
  results.reduce((acc, r) => acc + (Number(r.hours) || 0), 0);

export const sumApprovedLeaveDays = (results: LeaveRequest[] = []) =>
  results
    .filter((r) => r.status === "approved")
    .reduce((acc, r) => acc + (Number(r.days_requested) || 0), 0);

export const sumPendingLeaveDays = (results: LeaveRequest[] = []) =>
  results
    .filter((r) => r.status === "pending")
    .reduce((acc, r) => acc + (Number(r.days_requested) || 0), 0);
