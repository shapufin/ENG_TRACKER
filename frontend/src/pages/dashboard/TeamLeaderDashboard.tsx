import React from "react";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/context/PermissionContext";
import { useTeamLeaderDashboardData } from "@/hooks/useTeamLeaderDashboardData";
import { PageShell } from "@/components/layout/PageShell";
import type { DashboardType } from "@/context/permission-context-base";
import { TLStatsCards } from "./components/TLStatsCards";
import { QueueMixCard } from "./components/QueueMixCard";
import { MonthlyComparisonCard } from "./components/MonthlyComparisonCard";
import { TopBottlenecksCard } from "./components/TopBottlenecksCard";
import { QueueHighlightsSection } from "./components/QueueHighlightsSection";
import { TeamLeaderDashboardHeader } from "./components/TeamLeaderDashboardHeader";
import { useTeamLeaderDashboardUI } from "./hooks/useTeamLeaderDashboardUI";

interface TeamLeaderDashboardProps {
  selectedDashboard?: DashboardType;
  onDashboardChange?: (dashboard: DashboardType) => void;
}

const TeamLeaderDashboard: React.FC<TeamLeaderDashboardProps> = ({
  selectedDashboard = "team_leader",
  onDashboardChange,
}) => {
  const { user, isLoading } = useAuth();
  const { availableDashboards, isTeamLeader, isHR, isAdmin, isSuperuser } = usePermissions();
  const userId = user?.id;
  const teamId = user?.teams?.[0]?.id;
  const shouldQueryTeamData = !isLoading && !!userId && isTeamLeader;

  const handleDashboardChange = (dashboard: DashboardType) => {
    if (onDashboardChange) onDashboardChange(dashboard);
    try {
      localStorage.setItem("selectedDashboard", dashboard);
    } catch {
      /* ignore */
    }
  };

  const dashboardData = useTeamLeaderDashboardData({ userId, teamId, shouldQueryTeamData });
  const { pendingCounts, queueSegments, uiTopPendingUsers, uiQueueHighlights } =
    useTeamLeaderDashboardUI(dashboardData);

  return (
    <PageShell
      title="Team Leader Dashboard"
      subtitle={`Managing ${user?.teams?.[0]?.name || "your team"} - ${dashboardData.teamStats?.team_size || 0} members`}
    >
      <div className="flex flex-col gap-6">
        <TeamLeaderDashboardHeader
          availableDashboards={availableDashboards}
          selectedDashboard={selectedDashboard}
          onDashboardChange={handleDashboardChange}
          isTeamLeader={isTeamLeader}
          isHR={isHR}
          isAdmin={isAdmin}
          isSuperuser={isSuperuser}
        />

        <TLStatsCards
          pendingTotal={pendingCounts.total}
          pendingOvertime={pendingCounts.overtime}
          pendingStandby={pendingCounts.standby}
          pendingLeave={pendingCounts.leave}
          approvedCount={dashboardData.teamStats?.approved_count ?? 0}
        />

        <div className="grid gap-6 xl:grid-cols-[1.1fr_1.1fr_0.9fr]">
          <QueueMixCard
            pendingTotal={pendingCounts.total}
            pendingStandby={pendingCounts.standby}
            queueSegments={queueSegments}
          />
          <MonthlyComparisonCard data={dashboardData.monthlyComparison} />
          <TopBottlenecksCard
            users={uiTopPendingUsers}
            isLoading={dashboardData.isTopPendingUsersLoading}
            isError={dashboardData.isTopPendingUsersError}
          />
        </div>

        <QueueHighlightsSection
          highlights={uiQueueHighlights}
          isLoading={dashboardData.isQueueHighlightsLoading}
          isError={dashboardData.isQueueHighlightsError}
        />
      </div>
    </PageShell>
  );
};

export default TeamLeaderDashboard;
