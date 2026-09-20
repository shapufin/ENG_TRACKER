import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/context/PermissionContext";
import { useTeamLeaderDashboardData } from "@/hooks/useTeamLeaderDashboardData";
import { PageShell } from "@/components/layout/PageShell";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/input";
import type { DashboardType } from "@/context/permission-context-base";
import { TLStatsCards } from "./components/TLStatsCards";
import { QueueMixCard } from "./components/QueueMixCard";
import { MonthlyComparisonCard } from "./components/MonthlyComparisonCard";
import { QueueHighlightsSection } from "./components/QueueHighlightsSection";
import { PendingTrendCard } from "./components/PendingTrendCard";
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
  const invalidateDashboard = () => queryClient.invalidateQueries({ queryKey: ["dashboard"] });

  const [approvingKeys, setApprovingKeys] = useState<Set<string>>(new Set());
  const [rejectTarget, setRejectTarget] = useState<{ id: number; type: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);

  const approveOneMutation = useMutation({
    mutationFn: ({ id, type }: { id: number; type: string }) => {
      const service = APPROVE_SERVICE_BY_TYPE[type];
      if (!service) throw new Error(`Unknown request type: ${type}`);
      return service.approve(id);
    },
    onSuccess: () => {
      toast.success("Request approved.");
    },
    onError: () => {
      toast.error("Approve failed. Please try again.");
    },
    onSettled: (_data, _error, variables) => {
      setApprovingKeys((prev) => {
        const next = new Set(prev);
        next.delete(`${variables.type}-${variables.id}`);
        return next;
      });
      invalidateDashboard();
    },
  });

  const rejectOneMutation = useMutation({
    mutationFn: ({ id, type, reason }: { id: number; type: string; reason: string }) => {
      const service = REJECT_SERVICE_BY_TYPE[type];
      if (!service) throw new Error(`Unknown request type: ${type}`);
      return service.reject(id, reason);
    },
    onSuccess: () => {
      toast.success("Request rejected.");
      setRejectTarget(null);
      setRejectReason("");
    },
    onError: () => {
      toast.error("Reject failed. Please try again.");
    },
    onSettled: () => {
      invalidateDashboard();
    },
  });

  const handleApproveOne = (id: number, type: string) => {
    if (!APPROVE_SERVICE_BY_TYPE[type]) return;
    const key = `${type}-${id}`;
    if (approvingKeys.has(key)) return;
    setApprovingKeys((prev) => new Set(prev).add(key));
    approveOneMutation.mutate({ id, type });
  };
  const handleRejectOne = (id: number, type: string) => {
    if (!REJECT_SERVICE_BY_TYPE[type]) return;
    setRejectTarget({ id, type });
    setRejectReason("");
  };
  const confirmRejectOne = () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    rejectOneMutation.mutate({
      id: rejectTarget.id,
      type: rejectTarget.type,
      reason: rejectReason.trim(),
    });
  };

  const teamSubtitle = `Managing ${user?.teams?.[0]?.name || "your team"} - ${dashboardData.teamStats?.team_size || 0} members`;

  return (
    <PageShell
      title="Team Leader Dashboard"
      subtitle={teamSubtitle}
      actions={
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
      }
    >
      <div className="flex flex-col gap-6">
        <TLStatsCards
          pendingTotal={pendingCounts.total}
          pendingOvertime={pendingCounts.overtime}
          pendingStandby={pendingCounts.standby}
          pendingLeave={pendingCounts.leave}
          approvedCount={dashboardData.teamStats?.approved_count ?? 0}
          teamSize={dashboardData.teamStats?.team_size ?? 0}
          activeOperatorCount={dashboardData.teamStats?.active_operator_count ?? null}
        />

        <div className="grid gap-6 xl:grid-cols-2">
          <QueueMixCard pendingTotal={pendingCounts.total} queueSegments={queueSegments} />
          <MonthlyComparisonCard
            data={dashboardData.monthlyComparison}
            granularity={comparisonGranularity}
            onGranularityChange={setComparisonGranularity}
          />
        </div>

        <PendingTrendCard data={dashboardData.pendingTrend} />

        <QueueHighlightsSection
          highlights={filteredSortedHighlights}
          isLoading={dashboardData.isQueueHighlightsLoading}
          isError={dashboardData.isQueueHighlightsError}
          typeCounts={highlightTypeCounts}
          filter={highlightFilter}
          onFilterChange={setHighlightFilter}
          sort={highlightSort}
          onSortChange={setHighlightSort}
          onBatchApprove={() => setBatchConfirmOpen(true)}
          isBatchApproving={isBatchApproving}
          onApproveOne={handleApproveOne}
          onRejectOne={handleRejectOne}
          approvingIds={approvingKeys}
          rejectingId={
            rejectOneMutation.isPending && rejectTarget
              ? `${rejectTarget.type}-${rejectTarget.id}`
              : null
          }
        />
      </div>

      <ConfirmDialog
        open={batchConfirmOpen}
        onOpenChange={setBatchConfirmOpen}
        title="Batch approve visible requests?"
        description={`${filteredSortedHighlights.filter((item) => item.status === "pending").length} pending request(s) currently visible will be approved. This cannot be undone.`}
        onConfirm={() => {
          setBatchConfirmOpen(false);
          batchApprove();
        }}
        isConfirming={isBatchApproving}
        confirmLabel="Approve all visible"
        variant="success"
      />

      <ConfirmDialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
        title="Reject request"
        description="Provide a reason for rejection:"
        onConfirm={confirmRejectOne}
        isConfirming={rejectOneMutation.isPending}
        confirmDisabled={!rejectReason.trim()}
        confirmLabel="Reject"
        variant="destructive"
      >
        <div className="pt-2">
          <Input
            placeholder="Rejection reason (required)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            aria-label="Rejection reason"
          />
        </div>
      </ConfirmDialog>
    </PageShell>
  );
};

export default TeamLeaderDashboard;
