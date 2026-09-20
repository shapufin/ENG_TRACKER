import { useQuery } from "@tanstack/react-query";
import { dashboardService } from "@/services/dashboardService";
import { overtimeService } from "@/services/overtimeService";
import { standbyService } from "@/services/standbyService";
import { leaveService } from "@/services/leaveService";
import { useDashboardCalculations } from "./useDashboardCalculations";
import type { DashboardType } from "@/context/permission-context-base";

interface UseDashboardDataOptions {
  userId?: number;
  isAdmin: boolean;
  isHR: boolean;
  selectedDashboard: DashboardType;
}

// fallow-ignore-next-line complexity
export const useDashboardData = ({
  userId,
  isAdmin,
  isHR,
  selectedDashboard,
}: UseDashboardDataOptions) => {
  const isPrivilegedDashboard = selectedDashboard === "hr" || selectedDashboard === "admin";
  const dashboardPageSize = isPrivilegedDashboard ? 50 : 5;

  const { data: hrStats } = useQuery({
    queryKey: ["dashboard", "hr", userId ?? "anonymous"],
    queryFn: () => dashboardService.getHRStats(),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: !!userId && (isAdmin || isHR) && isPrivilegedDashboard,
  });

  const { data: overtimeData, isLoading: overtimeLoading } = useQuery({
    queryKey: ["overtime", userId ?? "anonymous", "dashboard", selectedDashboard],
    queryFn: () => overtimeService.getLogs({ page_size: dashboardPageSize }),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: !!userId,
  });

  const { data: standbyData, isLoading: standbyLoading } = useQuery({
    queryKey: ["standby", userId ?? "anonymous", "dashboard", selectedDashboard],
    queryFn: () => standbyService.getLogs({ page_size: dashboardPageSize }),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: !!userId,
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
    enabled: !!userId,
  });

  const { data: standbySummary } = useQuery({
    queryKey: ["standby", userId ?? "anonymous", "summary"],
    queryFn: () => standbyService.getSummary(),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: !!userId,
  });

  const { data: leaveData, isLoading: leaveLoading } = useQuery({
    queryKey: ["leaves", userId ?? "anonymous", "dashboard", selectedDashboard],
    queryFn: () => leaveService.getRequests({ page_size: dashboardPageSize }),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: !!userId,
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
    enabled: !!userId,
  });

  const overtimeResults = overtimeData?.results ?? [];
  const standbyResults = standbyData?.results ?? [];
  const leaveResults = leaveData?.results ?? [];
  const calculations = useDashboardCalculations(
    overtimeResults,
    standbyResults,
    leaveResults,
    hrStats
  );

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
  const today = toLocalDateString(new Date());
  const weekStart = toLocalDateString(new Date(new Date().setDate(new Date().getDate() - 6)));

  const { data: weeklyOvertimeData } = useQuery({
    queryKey: ["overtime", userId ?? "anonymous", "weekly", weekStart],
    queryFn: () =>
      overtimeService.getLogs({ date_from: weekStart, date_to: today, page_size: 100 }),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    // Personal-dashboard weekly chart only — HR/Admin/TL mounts must not pay
    // for data no other view consumes.
    enabled: !!userId && selectedDashboard === "employee",
  });

  const { data: weeklyStandbyData } = useQuery({
    queryKey: ["standby", userId ?? "anonymous", "weekly", weekStart],
    queryFn: () => standbyService.getLogs({ date_from: weekStart, date_to: today, page_size: 100 }),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    // Personal-dashboard weekly chart only — see above.
    enabled: !!userId && selectedDashboard === "employee",
  });

  return {
    hrStats,
    overtimeData,
    standbyData,
    leaveData,
    overtimeLoading,
    standbyLoading,
    leaveLoading,
    ...calculations,
    personalOvertimeHours: overtimeSummary?.total_hours ?? calculations.personalOvertimeHours,
    personalStandbyHours: standbySummary?.total_hours ?? calculations.personalStandbyHours,
    vacationBalanceDays:
      leaveBalanceSummary?.vacation?.total_available ?? calculations.approvedLeaveDays,
    weekOvertimeLogs: weeklyOvertimeData?.results ?? [],
    weekStandbyLogs: weeklyStandbyData?.results ?? [],
  };
};
