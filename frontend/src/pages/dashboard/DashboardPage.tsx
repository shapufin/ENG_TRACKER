import React, { Suspense, useState } from "react";
import { Navigate } from "react-router-dom";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/context/PermissionContext";
import { usePlugins } from "@/context/PluginContext";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { useDashboardSelection } from "./hooks/useDashboardSelection";
import { usePersonalDashboardItems } from "./hooks/usePersonalDashboardItems";
import { EmployeeDashboardPage } from "./components/EmployeeDashboardPage";
import { HRDashboardPage } from "./components/HRDashboardPage";
import { DashboardEmptyState } from "./components/DashboardEmptyState";

const TeamLeaderDashboard = React.lazy(() => import("./TeamLeaderDashboard"));

export const DashboardPage: React.FC = () => {
  const {
    isAdmin,
    isTeamLeader,
    isHR,
    isHBPROnly,
    isSuperuser,
    availableDashboards,
    primaryDashboard,
  } = usePermissions();
  const { activePlugins } = usePlugins();
  const { user } = useAuth();
  const userId = user?.id;

  const { selectedDashboard, handleDashboardChange } = useDashboardSelection(
    primaryDashboard,
    availableDashboards
  );

  // Rolling week window for the personal dashboard's weekly widget
  // (0 = this week, 1 = last week). Lives here so the data hook re-queries
  // real date ranges instead of the widget filtering client-side.
  const [weekOffset, setWeekOffset] = useState<0 | 1>(0);

  const dashboardData = useDashboardData({
    userId,
    isAdmin,
    isHR,
    selectedDashboard,
    weekOffset,
  });

  const personalItems = usePersonalDashboardItems({
    overtimeData: dashboardData.overtimeData,
    standbyData: dashboardData.standbyData,
    leaveData: dashboardData.leaveData,
    approvedLeaveDays: dashboardData.approvedLeaveDays,
    recentActivity: dashboardData.recentActivity,
  });

  if (selectedDashboard === "team_leader" && isTeamLeader) {
    return (
      <Suspense fallback={<LoadingCard />}>
        <TeamLeaderDashboard
          selectedDashboard={selectedDashboard}
          onDashboardChange={handleDashboardChange}
        />
      </Suspense>
    );
  }

  // An HBPR-only user has no dashboard — their home is the plugin-owned /hbpr
  // workspace. The route check is required: with the tl_scorecard plugin off,
  // /hbpr hits the catch-all, which sends them back to /dashboard — an
  // unconditional Navigate would loop forever. Plugin off falls through to the
  // empty state, same as the old slot branch's fallback.
  const hbprWorkspaceRegistered = activePlugins.some((plugin) =>
    plugin.routes.some((route) => route.path === "/hbpr" && route.layout === "app")
  );
  if (isHBPROnly && hbprWorkspaceRegistered) {
    return <Navigate to="/hbpr" replace />;
  }

  // The admin dashboard lives at /admin (AdminShell) — DashboardPage has no
  // inline admin view, so redirect instead of showing the select interstitial.
  if (selectedDashboard === "admin" && isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  if (selectedDashboard === "employee") {
    return (
      <EmployeeDashboardPage
        user={user}
        availableDashboards={availableDashboards}
        selectedDashboard={selectedDashboard}
        onDashboardChange={handleDashboardChange}
        isTeamLeader={isTeamLeader}
        isHR={isHR}
        isAdmin={isAdmin}
        isSuperuser={isSuperuser}
        viewProps={{
          user,
          overtimeData: dashboardData.overtimeData,
          standbyData: dashboardData.standbyData,
          leaveData: dashboardData.leaveData,
          personalOvertimeHours: dashboardData.personalOvertimeHours,
          personalStandbyHours: dashboardData.personalStandbyHours,
          vacationBalanceDays: dashboardData.vacationBalanceDays,
          pendingLeaveDays: dashboardData.pendingLeaveDays,
          leaveProgress: personalItems.leaveGoalProgress,
          upcomingLeaves: personalItems.upcomingLeaves,
          personalPendingItems: personalItems.personalPendingItems,
          personalTimelineItems: personalItems.personalTimelineItems,
          weekOvertimeLogs: dashboardData.weekOvertimeLogs,
          weekStandbyLogs: dashboardData.weekStandbyLogs,
          weekReferenceDate: dashboardData.weekReferenceDate,
          leaveUsedDays: dashboardData.leaveUsedDays,
          leaveAvailableDays: dashboardData.leaveAvailableDays,
          weekOffset,
          onWeekOffsetChange: setWeekOffset,
        }}
      />
    );
  }

  if (selectedDashboard === "hr" && isHR) {
    return (
      <HRDashboardPage
        availableDashboards={availableDashboards}
        selectedDashboard={selectedDashboard}
        onDashboardChange={handleDashboardChange}
        isTeamLeader={isTeamLeader}
        isHR={isHR}
        isAdmin={isAdmin}
        isSuperuser={isSuperuser}
        viewProps={{
          hrStats: dashboardData.hrStats,
          overtimeData: dashboardData.overtimeData,
          standbyData: dashboardData.standbyData,
          leaveData: dashboardData.leaveData,
          monthlyData: dashboardData.monthlyData,
          statusBars: dashboardData.statusBars,
          recentOvertimeTable: dashboardData.recentOvertimeTable,
          recentStandbyTable: dashboardData.recentStandbyTable,
        }}
      />
    );
  }

  return (
    <DashboardEmptyState
      availableDashboards={availableDashboards}
      selectedDashboard={selectedDashboard}
      onDashboardChange={handleDashboardChange}
      isTeamLeader={isTeamLeader}
      isHR={isHR}
      isAdmin={isAdmin}
      isSuperuser={isSuperuser}
    />
  );
};
