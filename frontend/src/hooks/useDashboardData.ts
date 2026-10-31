import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { dashboardService } from "@/services/dashboardService";
import { overtimeService } from "@/services/overtimeService";
import { standbyService } from "@/services/standbyService";
import { leaveService } from "@/services/leaveService";
import { parseLocalDate } from "@/lib/date-format-utils";
import { useDashboardCalculations } from "./useDashboardCalculations";
import type { DashboardType } from "@/context/permission-context-base";

interface UseDashboardDataOptions {
  userId?: number;
  isAdmin: boolean;
  isHR: boolean;
  /** Pure HR (`isHROnly`): no overtime or standby, the API refuses both. */
  isHROnly?: boolean;
  selectedDashboard: DashboardType;
  /** Rolling 7-day windows back from today: 0 = this week, 1 = last week. */
  weekOffset?: number;
}

// fallow-ignore-next-line complexity
export const useDashboardData = ({
  userId,
  isAdmin,
  isHR,
  isHROnly = false,
  selectedDashboard,
  weekOffset = 0,
}: UseDashboardDataOptions) => {
  const isPrivilegedDashboard = selectedDashboard === "hr" || selectedDashboard === "admin";
  const dashboardPageSize = isPrivilegedDashboard ? 50 : 5;
  // The HR dashboard renders ORG data from a dedicated aggregate endpoint —
  // the personal OT/SB/leave list endpoints can't serve it (pure HR gets 403,
  // multi-role gets own-scope rows, everyone gets current-month-only).
  const isHrDashboard = selectedDashboard === "hr";
  // An HBPR-only viewer has no overtime, standby or leave (the API refuses
  // all of them via HbprBlockedMixin), so those queries must not fire even in
  // the single render before DashboardPage's /hbpr redirect mounts — "hbpr"
  // survives as their primaryDashboard routing token for exactly this.
  const canLoadSelfService = !!userId && !isHrDashboard && selectedDashboard !== "hbpr";
  // Pure HR has leave but no overtime or standby (HrOnlyBlockedMixin 403s them).
  const canLoadHours = canLoadSelfService && !isHROnly;

  const {
    data: hrOverview,
    isLoading: hrOverviewLoading,
    isError: hrOverviewError,
    refetch: refetchHrOverview,
  } = useQuery({
    queryKey: ["dashboard", "hr-overview", userId ?? "anonymous"],
    queryFn: () => dashboardService.getHROverview(),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: !!userId && isHrDashboard && (isAdmin || isHR),
  });

  // No `global_stats` fetch here: the HR view reads `hr_overview.stats`, and
  // every other dashboard ignores `hrStats`. The old query only fired for the
  // transient "admin" selection, one render before DashboardPage redirects to
  // /admin — a wasted request.

  // `ignore_date_filter` is deliberate: without it the list endpoint defaults
  // to the current business month, so every dashboard's "recent" lists and
  // charts sat empty on the 1st of each month until new rows appeared. These
  // queries want the latest rows regardless of month; the page-size cap still
  // keeps them cheap.
  const { data: overtimeData, isLoading: overtimeLoading } = useQuery({
    queryKey: ["overtime", userId ?? "anonymous", "dashboard", selectedDashboard],
    queryFn: () =>
      overtimeService.getLogs({
        page_size: dashboardPageSize,
        ignore_date_filter: "true",
      }),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: canLoadHours,
  });

  const { data: standbyData, isLoading: standbyLoading } = useQuery({
    queryKey: ["standby", userId ?? "anonymous", "dashboard", selectedDashboard],
    queryFn: () =>
      standbyService.getLogs({
        page_size: dashboardPageSize,
        ignore_date_filter: "true",
      }),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: canLoadHours,
  });

  // Dedicated aggregate queries for the "total hours" dashboard tiles: the
  // logs queries above are capped at dashboardPageSize (5 for a personal
  // dashboard) for the recent-activity list/chart, so summing their
  // .results silently undercounts anyone with more entries than that page
  // size. These hit the same server-side Sum('hours') the logs pages use,
  // unpaginated.
  const { data: overtimeSummary } = useQuery({
    queryKey: ["overtime", userId ?? "anonymous", "summary"],
    queryFn: () => overtimeService.getSummary(),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: canLoadHours,
  });

  const { data: standbySummary } = useQuery({
    queryKey: ["standby", userId ?? "anonymous", "summary"],
    queryFn: () => standbyService.getSummary(),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: canLoadHours,
  });

  const { data: leaveData, isLoading: leaveLoading } = useQuery({
    queryKey: ["leaves", userId ?? "anonymous", "dashboard", selectedDashboard],
    queryFn: () => leaveService.getRequests({ page_size: dashboardPageSize }),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: canLoadSelfService,
  });

  // The "Vacation Balance" tile must show the user's actual remaining
  // balance (total_available), not a sum of approved requests from the
  // capped dashboardPageSize page above — same undercount class of bug
  // already fixed for overtime/standby.
  const { data: leaveBalanceSummary } = useQuery({
    queryKey: ["leaves", userId ?? "anonymous", "balance-summary"],
    queryFn: () => leaveService.getUserBalanceSummary(),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: canLoadSelfService,
  });

  const overtimeResults = overtimeData?.results ?? [];
  const standbyResults = standbyData?.results ?? [];
  const leaveResults = leaveData?.results ?? [];
  const calculations = useDashboardCalculations(overtimeResults, standbyResults, leaveResults);

  // Dedicated date-ranged query for the personal dashboard's weekly hours
  // chart: overtimeData/standbyData above are capped at dashboardPageSize
  // (5 for a personal dashboard) for the recent-activity list, which
  // silently undercounts a week with more than 5 logs — same undercount
  // class the overtimeSummary/standbySummary queries above already fix for
  // the "total hours" tiles.
  const toLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  // Rolling window end shifts back a full week per offset so the personal
  // dashboard's This Week / Last Week selector re-queries real ranges.
  const windowEnd = new Date(new Date().setDate(new Date().getDate() - 7 * weekOffset));
  const weekStart = toLocalDateString(
    new Date(new Date(windowEnd).setDate(windowEnd.getDate() - 6))
  );
  const weekEnd = toLocalDateString(windowEnd);

  const { data: weeklyOvertimeData } = useQuery({
    queryKey: ["overtime", userId ?? "anonymous", "weekly", weekStart],
    queryFn: () =>
      overtimeService.getLogs({ date_from: weekStart, date_to: weekEnd, page_size: 100 }),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    // Personal-dashboard weekly chart only — HR/Admin/TL mounts must not pay
    // for data no other view consumes.
    enabled: !!userId && selectedDashboard === "employee",
  });

  const { data: weeklyStandbyData } = useQuery({
    queryKey: ["standby", userId ?? "anonymous", "weekly", weekStart],
    queryFn: () =>
      standbyService.getLogs({ date_from: weekStart, date_to: weekEnd, page_size: 100 }),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    // Personal-dashboard weekly chart only — see above.
    enabled: !!userId && selectedDashboard === "employee",
  });

  // HR-view derivations from the org aggregate (see isHrDashboard above).
  const hrMonthlyData = useMemo(
    () =>
      (hrOverview?.monthly_hours ?? []).map((m) => ({
        day: m.label,
        month: m.month,
        overtime: m.overtime,
        standby: m.standby,
      })),
    [hrOverview]
  );
  const hrStatusBars = useMemo(
    () =>
      hrOverview
        ? [
            { label: "Pending", value: hrOverview.status_counts.pending },
            { label: "Approved", value: hrOverview.status_counts.approved },
            { label: "Rejected", value: hrOverview.status_counts.rejected },
          ]
        : [],
    [hrOverview]
  );
  const toHoursRow = (r: {
    id: number;
    user_name: string;
    hours: number;
    date: string;
    status: string;
  }) => ({
    id: r.id,
    user: r.user_name,
    userInitials: r.user_name.slice(0, 2).toUpperCase(),
    duration: `${r.hours}h`,
    date: parseLocalDate(r.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    status: r.status,
  });
  const hrRecentOvertime = useMemo(
    () => (hrOverview?.recent_overtime ?? []).map(toHoursRow),
    [hrOverview]
  );
  const hrRecentStandby = useMemo(
    () => (hrOverview?.recent_standby ?? []).map(toHoursRow),
    [hrOverview]
  );

  return {
    // The HR tile shows this month's average, so it overrides the lifetime `avg_overtime_hours`.
    hrStats:
      isHrDashboard && hrOverview
        ? { ...hrOverview.stats, avg_overtime_hours: hrOverview.month_avg_overtime_hours }
        : undefined,
    overtimeData,
    standbyData,
    leaveData,
    overtimeLoading,
    standbyLoading,
    leaveLoading,
    ...calculations,
    // The HR view is the only consumer of these four: every other dashboard
    // renders its own cards (employee) or its own hook (team leader). The HR
    // values come from the org aggregate, never from `calculations`.
    // These four feed the HR view only; every other dashboard reads its own
    // hook (the personal view never rendered the org tables/chart).
    monthlyData: hrMonthlyData,
    statusBars: hrStatusBars,
    recentOvertimeTable: hrRecentOvertime,
    recentStandbyTable: hrRecentStandby,
    pendingLeaveItems: hrOverview?.pending_leave ?? [],
    pendingLeaveTotal: hrOverview?.pending_leave_total ?? 0,
    hrOverviewLoading,
    hrOverviewError,
    refetchHrOverview,
    personalOvertimeHours: overtimeSummary?.total_hours ?? calculations.personalOvertimeHours,
    personalStandbyHours: standbySummary?.total_hours ?? calculations.personalStandbyHours,
    vacationBalanceDays:
      leaveBalanceSummary?.vacation?.total_available ?? calculations.approvedLeaveDays,
    leaveUsedDays: leaveBalanceSummary?.vacation?.total_used ?? 0,
    leaveAvailableDays: leaveBalanceSummary?.vacation?.total_available ?? 0,
    weekOvertimeLogs: weeklyOvertimeData?.results ?? [],
    weekStandbyLogs: weeklyStandbyData?.results ?? [],
    /** ISO end date of the selected rolling window; the chart buckets from it. */
    weekReferenceDate: weekEnd,
  };
};
