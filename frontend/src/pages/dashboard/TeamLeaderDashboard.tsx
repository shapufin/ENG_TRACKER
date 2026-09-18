import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/context/PermissionContext";
import { useTeamLeaderDashboardData } from "@/hooks/useTeamLeaderDashboardData";
import { PageShell } from "@/components/layout/PageShell";
import type { DashboardType } from "@/context/permission-context-base";
import { TLStatsCards } from "./components/TLStatsCards";
import { QueueMixCard } from "./components/QueueMixCard";
import { MonthlyComparisonCard } from "./components/MonthlyComparisonCard";
import { QueueHighlightsSection } from "./components/QueueHighlightsSection";
import { TeamLeaderDashboardHeader } from "./components/TeamLeaderDashboardHeader";
import {
  useTeamLeaderDashboardUI,
  type HighlightFilter,
  type HighlightSort,
} from "./hooks/useTeamLeaderDashboardUI";
import { useQueueBatchApprove } from "./hooks/useQueueBatchApprove";
import { overtimeService } from "@/services/overtimeService";
import { standbyService } from "@/services/standbyService";
import { leaveService } from "@/services/leaveService";

const APPROVE_SERVICE_BY_TYPE: Record<string, { approve: (id: number) => Promise<unknown> }> = {
  overtime: overtimeService,
  standby: standbyService,
  leave: leaveService,
};
const REJECT_SERVICE_BY_TYPE: Record<
  string,
  { reject: (id: number, rejectionReason: string) => Promise<unknown> }
> = {
  overtime: overtimeService,
  standby: standbyService,
  leave: leaveService,
};

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

  const [comparisonGranularity, setComparisonGranularity] = useState<"week" | "month">("month");
  const [highlightFilter, setHighlightFilter] = useState<HighlightFilter>("all");
  const [highlightSort, setHighlightSort] = useState<HighlightSort>("recent");

  const handleDashboardChange = (dashboard: DashboardType) => {
    if (onDashboardChange) onDashboardChange(dashboard);
    try {
      localStorage.setItem("selectedDashboard", dashboard);
    } catch {
      /* ignore */
    }
  };

  const dashboardData = useTeamLeaderDashboardData({
    userId,
    teamId,
    shouldQueryTeamData,
    comparisonGranularity,
  });
  const { pendingCounts, queueSegments, highlightTypeCounts, filteredSortedHighlights } =
    useTeamLeaderDashboardUI(dashboardData, { highlightFilter, highlightSort });

  const { batchApprove, isBatchApproving } = useQueueBatchApprove({
    highlights: filteredSortedHighlights,
  });

  const queryClient = useQueryClient();
  const handleApproveOne = async (id: number, type: string) => {
    await APPROVE_SERVICE_BY_TYPE[type]?.approve(id);
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const handleRejectOne = async (id: number, type: string) => {
    await REJECT_SERVICE_BY_TYPE[type]?.reject(id, "");
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

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
          pendingApprovalCount={pendingCounts.total}
        />

        <TLStatsCards
          pendingTotal={pendingCounts.total}
          pendingOvertime={pendingCounts.overtime}
          pendingStandby={pendingCounts.standby}
          pendingLeave={pendingCounts.leave}
          approvedCount={dashboardData.teamStats?.approved_count ?? 0}
        />

        <div className="grid gap-6 xl:grid-cols-2">
          <QueueMixCard
            pendingTotal={pendingCounts.total}
            pendingStandby={pendingCounts.standby}
            queueSegments={queueSegments}
          />
          <MonthlyComparisonCard
            data={dashboardData.monthlyComparison}
            granularity={comparisonGranularity}
            onGranularityChange={setComparisonGranularity}
          />
        </div>

        <QueueHighlightsSection
          highlights={filteredSortedHighlights}
          isLoading={dashboardData.isQueueHighlightsLoading}
          isError={dashboardData.isQueueHighlightsError}
          typeCounts={highlightTypeCounts}
          filter={highlightFilter}
          onFilterChange={setHighlightFilter}
          sort={highlightSort}
          onSortChange={setHighlightSort}
          onBatchApprove={batchApprove}
          isBatchApproving={isBatchApproving}
          onApproveOne={handleApproveOne}
          onRejectOne={handleRejectOne}
        />
      </div>
    </PageShell>
  );
};

export default TeamLeaderDashboard;
