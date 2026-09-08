import React, { Suspense } from "react";
import { Navigate } from "react-router-dom";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/context/PermissionContext";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { useDashboardSelection } from "./hooks/useDashboardSelection";
import { usePersonalDashboardItems } from "./hooks/usePersonalDashboardItems";
import { EmployeeDashboardPage } from "./components/EmployeeDashboardPage";
import { HRDashboardPage } from "./components/HRDashboardPage";
import { DashboardEmptyState } from "./components/DashboardEmptyState";

const TeamLeaderDashboard = React.lazy(() => import("./TeamLeaderDashboard"));

export const DashboardPage: React.FC = () => {
  const { isAdmin, isTeamLeader, isHR, isSuperuser, availableDashboards, primaryDashboard } =
    usePermissions();
  const { user } = useAuth();
  const userId = user?.id;

  const { selectedDashboard, handleDashboardChange } = useDashboardSelection(
    primaryDashboard,
    availableDashboards
  );

  const dashboardData = useDashboardData({ userId, isAdmin, isHR, selectedDashboard });

  const personalItems = usePersonalDashboardItems({
    overtimeData: dashboardData.overtimeData,
    standbyData: dashboardData.standbyData,
    leaveData: dashboardData.leaveData,
    personalOvertimeHours: dashboardData.personalOvertimeHours,
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
          approvedLeaveDays: dashboardData.approvedLeaveDays,
          pendingLeaveDays: dashboardData.pendingLeaveDays,
          overtimeProgress: personalItems.overtimeGoalProgress,
          leaveProgress: personalItems.leaveGoalProgress,
          upcomingLeaves: personalItems.upcomingLeaves,
          personalPendingItems: personalItems.personalPendingItems,
          personalTimelineItems: personalItems.personalTimelineItems,
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
