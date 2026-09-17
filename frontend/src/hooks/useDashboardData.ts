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

  const overtimeResults = overtimeData?.results ?? [];
  const standbyResults = standbyData?.results ?? [];
  const leaveResults = leaveData?.results ?? [];
  const calculations = useDashboardCalculations(
    overtimeResults,
    standbyResults,
    leaveResults,
    hrStats
  );

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
  };
};
