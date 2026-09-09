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

export const buildMonthlyData = (results: OvertimeLog[] = []) => {
  const grouped: Record<string, number> = {};
  results.forEach((r) => {
    const date = r.date ?? r.created_at ?? "";
    const dateKey = new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    grouped[dateKey] = (grouped[dateKey] || 0) + (Number(r.hours) || 0);
  });
  return Object.entries(grouped)
    .slice(0, 6)
    .map(([day, overtime]) => ({ day, overtime }));
};

export const buildStatusBars = (
  hrStats:
    | { pending_overtime?: number; pending_standby?: number; pending_leaves?: number }
    | undefined,
  overtime: OvertimeLog[] = [],
  standby: StandbyLog[] = [],
  leave: LeaveRequest[] = []
) => {
  const pending =
    (hrStats?.pending_overtime ?? 0) +
    (hrStats?.pending_standby ?? 0) +
    (hrStats?.pending_leaves ?? 0);
  const allItems: { status: string }[] = [...overtime, ...standby, ...leave];
  const approved = allItems.filter((r) => r.status === "approved").length;
  const rejected = allItems.filter((r) => r.status === "rejected").length;
  return [
    { label: "Pending", value: pending },
    { label: "Approved", value: approved },
    { label: "Rejected", value: rejected },
  ];
};

const formatDate = (date?: string) =>
  date
    ? new Date(date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "N/A";

interface HoursTableItem {
  id: number;
  user: number | string;
  user_name?: string;
  hours: number;
  date: string;
  status: string;
}

const buildHoursTable = <T extends HoursTableItem>(results: T[] = []) =>
  results.slice(0, 5).map((r) => ({
    id: r.id,
    user: r.user_name || String(r.user),
    userInitials: (r.user_name || String(r.user)).slice(0, 2).toUpperCase(),
    duration: `${r.hours}h`,
    date: formatDate(r.date),
    status: r.status,
  }));

export const buildOvertimeTable = (results: OvertimeLog[] = []) => buildHoursTable(results);
export const buildStandbyTable = (results: StandbyLog[] = []) => buildHoursTable(results);
