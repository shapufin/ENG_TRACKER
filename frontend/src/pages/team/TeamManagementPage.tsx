import { toast } from "sonner";
import React, { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTeamManagement } from "@/hooks/useTeamManagement";
import { AnimatePresence } from "framer-motion";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input } from "@/components/ui/input";
import { LoadingStateWrapper } from "@/components/ui/LoadingStateWrapper";
import { Badge } from "@/components/ui/badge";
import { Chip } from "@/components/ui/Chip";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

import { usePermissions } from "@/context/PermissionContext";
import { Users, Clock, Calendar as CalendarIcon, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OvertimeLog, StandbyLog, LeaveRequest } from "@/types";
import { RecordDetailModal, type RecordDetailSiblings } from "@/components/team/RecordDetailModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeamBulkOperationsPanel } from "@/components/team/TeamBulkOperationsPanel";
import { useTeamPageData } from "./hooks/useTeamPageData";
import { useTeamColumns } from "./hooks/useTeamColumns";
import { useTeamBulkActions } from "./hooks/useTeamBulkActions";
import { TeamOverviewCard } from "./components/TeamOverviewCard";
import { TeamFilterBar, type TeamGroupingMode } from "./components/TeamFilterBar";
import { TeamExportDialog } from "./components/TeamExportDialog";
import { TeamGroupedTables, type MonthlyTableSection } from "./components/TeamGroupedTables";
import { handleRejectConfirm } from "./teamManagementHelpers";
import { overtimeService } from "@/services/overtimeService";
import { standbyService } from "@/services/standbyService";
import {
  buildMonthlyStandbySections,
  buildStandbyRotations,
  collapseSameDayStandbyLogs,
  pendingIdsOf,
  selectedPendingRecordIds,
  selectedRecordIds,
  type StandbyRotationLog,
} from "@/lib/standbyDayGroups";
import {
  buildMonthlyOvertimeSections,
  collapseSameDayOvertimeLogs,
  type DayGroupedOvertimeLog,
} from "@/lib/overtimeDayGroups";
import {
  buildLeaveRangeClusters,
  buildMonthlyLeaveSections,
  type ClusteredLeaveRequest,
} from "@/lib/leaveRangeGroups";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import { cn } from "@/lib/utils";
import type { RowSelectionState } from "@tanstack/react-table";

const TEAM_OVERTIME_CARD = {
  title: "user_name",
  hero: "hours",
  status: "status",
  meta: ["client_name", "date", "ticket_references"],
};
const TEAM_OVERTIME_DAY_CARD = {
  title: "user_name",
  hero: "hours",
  status: "status",
  meta: ["date", "blocks", "client_name", "ticket_references"],
};
const TEAM_STANDBY_CARD = {
  title: "user_name",
  hero: "hours",
  status: "status",
  meta: ["date"],
};
const TEAM_STANDBY_ROTATION_CARD = {
  title: "user_name",
  hero: "hours",
  status: "status",
  meta: ["date", "breakdown"],
};
const TEAM_LEAVE_CARD = {
  title: "user_name",
  hero: "days_requested",
  status: "status",
  meta: ["request_type", "start_date", "end_date", "user_leave_balance"],
};
const TEAM_LEAVE_RANGE_CARD = {
  title: "user_name",
  hero: "days_requested",
  status: "status",
  meta: ["request_type", "start_date", "end_date", "overlap", "user_leave_balance"],
};

const QUICK_REJECTION_REASONS = [
  "Missing ticket reference",
  "Outside approved window",
  "Insufficient details",
  "Duplicate entry",
];

// fallow-ignore-next-line complexity
const TeamManagementPage: React.FC = () => {
  const {
    overtimeLogs,
    standbyLogs,
    leaveRequests,
    teamMembers,
    teamBalances,
    isLoading,
    otApproveMutation,
    otRejectMutation,
    sbApproveMutation,
    sbRejectMutation,
    leaveApproveMutation,
    leaveRejectMutation,
  } = useTeamManagement();

  const { canManageTeam } = usePermissions();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"overtime" | "standby" | "leave">("overtime");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved" | "rejected">(
    "all"
  );
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTeam, setFilterTeam] = useState("all");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [groupingByTab, setGroupingByTab] = useState<
    Record<"overtime" | "standby" | "leave", TeamGroupingMode>
  >({
    overtime: "range",
    standby: "range",
    leave: "range",
  });
  const memberGroupMode = groupingByTab[activeTab];
  const isRangeMode = memberGroupMode === "range";

  const [selectedRecord, setSelectedRecord] = useState<
    OvertimeLog | StandbyLog | LeaveRequest | null
  >(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectingRecord, setRejectingRecord] = useState<{
    id: number;
    type: "overtime" | "standby" | "leave";
  } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [bulkRejectReason, setBulkRejectReason] = useState("");
  const [isGroupedMutating, setIsGroupedMutating] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const {
    confirmAction,
    setConfirmAction,
    handleBulkAction,
    confirmBulkAction,
    isApproving,
    isRejecting,
    isDeleting,
  } = useTeamBulkActions(activeTab, () => setRowSelection({}));

  const {
    membersData,
    userMetaMap,
    availableTeams,
    vacationDaysLeft,
    overtimeHours,
    pendingOvertimeHours,
    standbyHours,
    pendingStandbyHours,
    filteredOvertime,
    filteredStandby,
    filteredLeaves,
  } = useTeamPageData(
    overtimeLogs,
    standbyLogs,
    leaveRequests,
    teamMembers,
    teamBalances,
    filterStatus,
    filterTeam,
    dateFrom,
    dateTo,
    searchQuery
  );

  const displayOvertime = useMemo(
    () => (isRangeMode ? collapseSameDayOvertimeLogs(filteredOvertime) : filteredOvertime),
    [filteredOvertime, isRangeMode]
  );

  const displayStandby = useMemo(() => {
    const collapsed = collapseSameDayStandbyLogs(filteredStandby);
    return isRangeMode ? buildStandbyRotations(collapsed) : collapsed;
  }, [filteredStandby, isRangeMode]);

  const displayLeaves = useMemo(
    () => (isRangeMode ? buildLeaveRangeClusters(filteredLeaves) : filteredLeaves),
    [filteredLeaves, isRangeMode]
  );

  const selectedCount = useMemo(
    () => Object.keys(rowSelection).filter((k) => rowSelection[k]).length,
    [rowSelection]
  );

  const totalPendingCount = useMemo(() => {
    const otP = overtimeLogs.filter((l) => l.status === "pending").length;
    const sbP = standbyLogs.filter((l) => l.status === "pending").length;
    const lvP = leaveRequests.filter((l) => l.status === "pending").length;
    return otP + sbP + lvP;
  }, [overtimeLogs, standbyLogs, leaveRequests]);

  const statusCounts = useMemo(() => {
    const source =
      activeTab === "overtime"
        ? overtimeLogs
        : activeTab === "standby"
          ? standbyLogs
          : leaveRequests;
    return {
      all: source.length,
      pending: source.filter((r) => r.status === "pending").length,
      approved: source.filter((r) => r.status === "approved").length,
      rejected: source.filter((r) => r.status === "rejected").length,
    };
  }, [activeTab, overtimeLogs, standbyLogs, leaveRequests]);

  const handleFilterStatusChange = (status: "all" | "pending" | "approved" | "rejected") => {
    setRowSelection({});
    setFilterStatus(status);
  };

  const handleFilterTeamChange = (team: string) => {
    setRowSelection({});
    setFilterTeam(team);
  };

  const handleDateFromChange = (date: string) => {
    setRowSelection({});
    setDateFrom(date);
  };

  const handleDateToChange = (date: string) => {
    setRowSelection({});
    setDateTo(date);
  };

  const handleSearchChange = (q: string) => {
    setRowSelection({});
    setSearchQuery(q);
  };

  const handleMemberGroupModeChange = (mode: TeamGroupingMode) => {
    setRowSelection({});
    setGroupingByTab((prev) => ({ ...prev, [activeTab]: mode }));
  };

  const handleResetFilters = () => {
    setRowSelection({});
    setSearchQuery("");
    setFilterStatus("all");
    setFilterTeam("all");
    setDateFrom("");
    setDateTo("");
  };

  const handleReject = (id: number, type: "overtime" | "standby" | "leave") => {
    setRejectingRecord({ id, type });
    setRejectOpen(true);
  };

  const wrappedOtApprove = useMemo(
    () => ({
      ...otApproveMutation,
      isPending: otApproveMutation.isPending || isGroupedMutating,
      mutate: (id: number) => {
        const target = displayOvertime.find((l) => l.id === id) as
          | DayGroupedOvertimeLog
          | undefined;
        if (target?.blocks && target.blocks.length > 1) {
          const ids = pendingIdsOf(target);
          if (ids.length === 0 || isGroupedMutating) return;
          setIsGroupedMutating(true);
          overtimeService
            .bulkApprove(ids)
            .then((res) => {
              queryClient.invalidateQueries({ queryKey: ["team", "overtime"] });
              queryClient.invalidateQueries({ queryKey: ["dashboard"] });
              if (res?.failed_ids?.length) {
                toast.warning(`${res.failed_ids.length} block(s) could not be approved.`);
              }
            })
            .catch(() => toast.error("Could not approve this day. Refresh and try again."))
            .finally(() => setIsGroupedMutating(false));
        } else {
          otApproveMutation.mutate(id);
        }
      },
    }),
    [otApproveMutation, displayOvertime, queryClient, isGroupedMutating]
  );

  const wrappedSbApprove = useMemo(
    () => ({
      ...sbApproveMutation,
      isPending: sbApproveMutation.isPending || isGroupedMutating,
      mutate: (id: number) => {
        const target = displayStandby.find((l) => l.id === id) as StandbyRotationLog | undefined;
        if (target?.segment_ids && target.segment_ids.length > 1) {
          const ids = pendingIdsOf(target);
          if (ids.length === 0 || isGroupedMutating) return;
          setIsGroupedMutating(true);
          standbyService
            .bulkApprove(ids)
            .then((res) => {
              queryClient.invalidateQueries({ queryKey: ["team", "standby"] });
              queryClient.invalidateQueries({ queryKey: ["dashboard"] });
              if (res?.failed_ids?.length) {
                toast.warning(`${res.failed_ids.length} shift(s) could not be approved.`);
              }
            })
            .catch(() => toast.error("Could not approve this rotation. Refresh and try again."))
            .finally(() => setIsGroupedMutating(false));
        } else {
          sbApproveMutation.mutate(id);
        }
      },
    }),
    [sbApproveMutation, displayStandby, queryClient, isGroupedMutating]
  );

  const { getOvertimeColumns, getStandbyColumns, getLeaveColumns } = useTeamColumns(
    setSelectedRecord,
    handleReject,
    wrappedOtApprove,
    otRejectMutation,
    wrappedSbApprove,
    sbRejectMutation,
    leaveApproveMutation,
    leaveRejectMutation,
    isRangeMode
  );

  const drawerSiblings = useMemo<RecordDetailSiblings | undefined>(() => {
    if (!selectedRecord) return undefined;
    if (activeTab === "overtime") {
      const rec = selectedRecord as OvertimeLog;
      const periodKey = rec.requested_processing_period ?? "";
      const sameDay = overtimeLogs.filter(
        (l) =>
          l.user === rec.user &&
          l.date === rec.date &&
          (l.requested_processing_period ?? "") === periodKey
      );
      if (sameDay.length <= 1) return undefined;
      return {
        title: `Same-day blocks (${sameDay.length})`,
        items: sameDay.map((b) => ({
          id: b.id,
          label: `${b.start_time?.slice(0, 5) ?? "Block"} – ${b.client_name || "Overtime"}`,
          meta: `${Number(b.hours)}h · ${b.status}`,
          active: b.id === rec.id,
          onSelect: () => setSelectedRecord(b),
        })),
      };
    }
    if (activeTab === "standby") {
      const rec = selectedRecord as StandbyRotationLog;
      const days =
        rec.days ?? standbyLogs.filter((l) => l.user === rec.user && l.date === rec.date);
      if (days.length <= 1) return undefined;
      return {
        title: `Rotation days (${days.length})`,
        items: days.map((d) => ({
          id: d.id,
          label: formatDateDDMMYYYY(d.date),
          meta: `${Number(d.hours)}h · ${d.status}`,
          active: d.id === rec.id,
        })),
      };
    }
    const rec = selectedRecord as LeaveRequest;
    const overlapping = leaveRequests.filter(
      (l) =>
        l.id !== rec.id &&
        l.status !== "rejected" &&
        l.status !== "cancelled" &&
        l.start_date <= rec.end_date &&
        l.end_date >= rec.start_date
    );
    if (overlapping.length === 0) return undefined;
    return {
      title: `Same-window absences (${overlapping.length})`,
      items: overlapping.map((l) => ({
        id: l.id,
        label: `${l.user_full_name || l.user_name || "Member"}${l.team_name === rec.team_name && l.team_name ? " · Same team" : ""}`,
        meta: `${formatDateDDMMYYYY(l.start_date)} – ${formatDateDDMMYYYY(l.end_date)}`,
        onSelect: () => setSelectedRecord(l),
      })),
    };
  }, [selectedRecord, activeTab, overtimeLogs, standbyLogs, leaveRequests]);

  const buildOvertimeSections = (
    rows: DayGroupedOvertimeLog[]
  ): MonthlyTableSection<DayGroupedOvertimeLog>[] =>
    buildMonthlyOvertimeSections(rows).map((s) => ({
      key: s.monthKey,
      title: s.monthLabel,
      rows: s.rows,
      summary: `${s.totalBlocks} ${s.totalBlocks === 1 ? "block" : "blocks"} · ${s.totalHours.toFixed(1)}h`,
      pendingLabel: s.pendingCount > 0 ? `${s.pendingCount} pending` : undefined,
    }));

  const buildStandbySections = (
    rows: StandbyRotationLog[]
  ): MonthlyTableSection<StandbyRotationLog>[] =>
    buildMonthlyStandbySections(rows).map((s) => ({
      key: s.monthKey,
      title: s.monthLabel,
      rows: s.rows,
      summary: `${s.totalShifts} ${s.totalShifts === 1 ? "shift" : "shifts"} · ${s.totalHours.toFixed(0)}h`,
      pendingLabel: s.pendingCount > 0 ? `${s.pendingCount} pending` : undefined,
    }));

  const buildLeaveSections = (
    rows: ClusteredLeaveRequest[]
  ): MonthlyTableSection<ClusteredLeaveRequest>[] =>
    buildMonthlyLeaveSections(rows).map((s) => ({
      key: s.monthKey,
      title: s.monthLabel,
      rows: s.rows,
      summary: `${s.totalRequests} ${s.totalRequests === 1 ? "request" : "requests"} · ${s.totalDays}d`,
      pendingLabel: s.pendingCount > 0 ? `${s.pendingCount} pending` : undefined,
    }));

  if (!canManageTeam) {
    return (
      <PageShell title="Team Overview">
        <GlassCard className="p-8 text-center">
          <Users className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
          <h2 className="mb-2 text-xl font-semibold">Access Denied</h2>
          <p className="text-muted-foreground">
            You don&apos;t have permission to access this page.
          </p>
        </GlassCard>
      </PageShell>
    );
  }

  const clearCollapsedSelection = (rowIds: string[]) => {
    const idSet = new Set(rowIds);
    setRowSelection((prev) => {
      const next: RowSelectionState = {};
      for (const [k, v] of Object.entries(prev)) {
        if (v && !idSet.has(k)) next[k] = v;
      }
      return next;
    });
  };

  const activeRows =
    activeTab === "overtime"
      ? displayOvertime
      : activeTab === "standby"
        ? displayStandby
        : displayLeaves;
  const bulkTargetIds =
    confirmAction?.action === "delete"
      ? selectedRecordIds(activeRows, rowSelection)
      : selectedPendingRecordIds(activeRows, rowSelection);
  const rangeGroupLabel =
    activeTab === "overtime" ? "By Day" : activeTab === "standby" ? "By Rotation" : "By Month";

  return (
    <PageShell
      title="Team Overview"
      subtitle="Comprehensive team management with filters, bulk operations, and full request history"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Chip
            pressed={filterStatus === "pending"}
            onClick={() => handleFilterStatusChange(filterStatus === "pending" ? "all" : "pending")}
          >
            Pending ({totalPendingCount})
          </Chip>
          <Button variant="outline" size="control" onClick={() => setExportOpen(true)}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <TeamOverviewCard
          memberCount={membersData.length}
          teamCount={availableTeams.length}
          vacationDaysLeft={vacationDaysLeft}
          overtimeHours={overtimeHours}
          pendingOvertimeHours={pendingOvertimeHours}
          standbyHours={standbyHours}
          pendingStandbyHours={pendingStandbyHours}
          activeTab={activeTab}
          isTeamsActive={memberGroupMode === "team"}
          onSelectTeams={() =>
            handleMemberGroupModeChange(memberGroupMode === "team" ? "range" : "team")
          }
          onSelectLeave={() => {
            setRowSelection({});
            setActiveTab("leave");
          }}
          onSelectOvertime={() => {
            setRowSelection({});
            setActiveTab("overtime");
          }}
          onSelectStandby={() => {
            setRowSelection({});
            setActiveTab("standby");
          }}
        />

        <Tabs
          value={activeTab}
          onValueChange={(v: string) => {
            setRowSelection({});
            setActiveTab(v as "overtime" | "standby" | "leave");
          }}
          className="space-y-4"
        >
          <TeamFilterBar
            searchQuery={searchQuery}
            onSearchQueryChange={handleSearchChange}
            filterStatus={filterStatus}
            onFilterStatusChange={handleFilterStatusChange}
            filterTeam={filterTeam}
            onFilterTeamChange={handleFilterTeamChange}
            dateFrom={dateFrom}
            onDateFromChange={handleDateFromChange}
            dateTo={dateTo}
            onDateToChange={handleDateToChange}
            memberGroupMode={memberGroupMode}
            onMemberGroupModeChange={handleMemberGroupModeChange}
            availableTeams={availableTeams}
            rangeGroupLabel={rangeGroupLabel}
            statusCounts={statusCounts}
            resultCount={
              activeTab === "overtime"
                ? filteredOvertime.length
                : activeTab === "standby"
                  ? filteredStandby.length
                  : filteredLeaves.length
            }
            onResetFilters={handleResetFilters}
            tier1Left={
              <TabsList className="grid w-full grid-cols-3 md:inline-grid md:w-auto">
                <TabsTrigger value="overtime" className="flex items-center gap-2">
                  <Clock className="hidden h-4 w-4 sm:inline" /> Overtime
                  {filteredOvertime.length > 0 && (
                    <Badge variant="secondary" className="ml-1">
                      {filteredOvertime.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="standby" className="flex items-center gap-2">
                  <Users className="hidden h-4 w-4 sm:inline" /> Standby
                  {filteredStandby.length > 0 && (
                    <Badge variant="secondary" className="ml-1">
                      {filteredStandby.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="leave" className="flex items-center gap-2">
                  <CalendarIcon className="hidden h-4 w-4 sm:inline" /> Leave
                  {filteredLeaves.length > 0 && (
                    <Badge variant="secondary" className="ml-1">
                      {filteredLeaves.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            }
          />

          <TeamExportDialog
            open={exportOpen}
            onOpenChange={setExportOpen}
            initialStartDate={dateFrom}
            initialEndDate={dateTo}
            initialStatus={filterStatus === "pending" ? "pending" : "approved"}
          />

          <AnimatePresence>
            {selectedCount > 0 && (
              <TeamBulkOperationsPanel
                selectedCount={selectedCount}
                onClear={() => setRowSelection({})}
                onApprove={() => handleBulkAction("approve", selectedCount)}
                onReject={() => handleBulkAction("reject", selectedCount)}
                onDelete={() => handleBulkAction("delete", selectedCount)}
                canManage={canManageTeam}
                isApproving={isApproving}
                isRejecting={isRejecting}
                isDeleting={isDeleting}
              />
            )}
          </AnimatePresence>

          <TabsContent value="overtime">
            <LoadingStateWrapper isLoading={isLoading}>
              <TeamGroupedTables
                rows={displayOvertime}
                columnsBuilder={() => getOvertimeColumns}
                emptyCopy="No overtime entries match your filters."
                memberGroupMode={memberGroupMode}
                userMetaMap={userMetaMap}
                mobileCard={isRangeMode ? TEAM_OVERTIME_DAY_CARD : TEAM_OVERTIME_CARD}
                enableColumnVisibility
                storageKey="table-visibility-team-overview-overtime"
                enableRowSelection
                rowSelection={rowSelection}
                onRowSelectionChange={setRowSelection}
                buildSections={buildOvertimeSections}
                onSectionCollapse={clearCollapsedSelection}
              />
            </LoadingStateWrapper>
          </TabsContent>
          <TabsContent value="standby">
            <LoadingStateWrapper isLoading={isLoading}>
              <TeamGroupedTables
                rows={displayStandby}
                columnsBuilder={() => getStandbyColumns}
                emptyCopy="No standby entries match your filters."
                memberGroupMode={memberGroupMode}
                userMetaMap={userMetaMap}
                mobileCard={isRangeMode ? TEAM_STANDBY_ROTATION_CARD : TEAM_STANDBY_CARD}
                enableColumnVisibility
                storageKey="table-visibility-team-overview-standby"
                enableRowSelection
                rowSelection={rowSelection}
                onRowSelectionChange={setRowSelection}
                buildSections={buildStandbySections}
                onSectionCollapse={clearCollapsedSelection}
              />
            </LoadingStateWrapper>
          </TabsContent>
          <TabsContent value="leave">
            <LoadingStateWrapper isLoading={isLoading}>
              <TeamGroupedTables
                rows={displayLeaves}
                columnsBuilder={() => getLeaveColumns}
                emptyCopy="No leave requests match your filters."
                memberGroupMode={memberGroupMode}
                userMetaMap={userMetaMap}
                mobileCard={isRangeMode ? TEAM_LEAVE_RANGE_CARD : TEAM_LEAVE_CARD}
                enableColumnVisibility
                storageKey="table-visibility-team-overview-leave"
                enableRowSelection
                rowSelection={rowSelection}
                onRowSelectionChange={setRowSelection}
                buildSections={buildLeaveSections}
                onSectionCollapse={clearCollapsedSelection}
                getRowClassName={(row) =>
                  cn(
                    "hover:bg-table-hover",
                    (row as ClusteredLeaveRequest).cluster_id &&
                      "shadow-[inset_3px_0_0_hsl(var(--tone-info-text))]"
                  )
                }
              />
            </LoadingStateWrapper>
          </TabsContent>
        </Tabs>

        <ConfirmDialog
          open={rejectOpen}
          onOpenChange={setRejectOpen}
          title="Reject Entry"
          description="Provide a reason for rejection:"
          onConfirm={() => {
            if (!rejectingRecord) return;
            const { id, type } = rejectingRecord;
            if (type === "overtime") {
              const target = displayOvertime.find((l) => l.id === id) as
                | DayGroupedOvertimeLog
                | undefined;
              if (target?.blocks && target.blocks.length > 1) {
                const ids = pendingIdsOf(target);
                if (ids.length === 0 || isGroupedMutating) return;
                setIsGroupedMutating(true);
                overtimeService
                  .bulkReject(ids, rejectReason)
                  .then((res) => {
                    queryClient.invalidateQueries({ queryKey: ["team", "overtime"] });
                    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
                    if (res?.failed_ids?.length) {
                      toast.warning(`${res.failed_ids.length} block(s) could not be rejected.`);
                    }
                    setRejectOpen(false);
                    setRejectReason("");
                    setRejectingRecord(null);
                  })
                  .catch(() => toast.error("Could not reject this day. Refresh and try again."))
                  .finally(() => setIsGroupedMutating(false));
                return;
              }
            }
            if (type === "standby") {
              const target = displayStandby.find((l) => l.id === id);
              if (target?.segment_ids && target.segment_ids.length > 1) {
                const ids = pendingIdsOf(target);
                if (ids.length === 0 || isGroupedMutating) return;
                setIsGroupedMutating(true);
                standbyService
                  .bulkReject(ids, rejectReason)
                  .then((res) => {
                    queryClient.invalidateQueries({ queryKey: ["team", "standby"] });
                    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
                    if (res?.failed_ids?.length) {
                      toast.warning(`${res.failed_ids.length} shift(s) could not be rejected.`);
                    }
                    setRejectOpen(false);
                    setRejectReason("");
                    setRejectingRecord(null);
                  })
                  .catch(() =>
                    toast.error("Could not reject this rotation. Refresh and try again.")
                  )
                  .finally(() => setIsGroupedMutating(false));
                return;
              }
            }
            handleRejectConfirm(
              rejectingRecord,
              rejectReason,
              {
                otReject: otRejectMutation,
                sbReject: sbRejectMutation,
                leaveReject: leaveRejectMutation,
              },
              () => {
                setRejectReason("");
                setRejectingRecord(null);
              }
            );
          }}
          isConfirming={
            otRejectMutation.isPending ||
            sbRejectMutation.isPending ||
            leaveRejectMutation.isPending
          }
          confirmLabel="Reject"
          variant="destructive"
        >
          <div className="space-y-2 pt-2">
            <div className="flex flex-wrap gap-1.5">
              {QUICK_REJECTION_REASONS.map((r) => (
                <Chip key={r} pressed={rejectReason === r} onClick={() => setRejectReason(r)}>
                  {r}
                </Chip>
              ))}
            </div>
            <Input
              placeholder="Rejection reason"
              aria-label="Rejection reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
        </ConfirmDialog>

        <ConfirmDialog
          open={confirmAction?.open || false}
          onOpenChange={(open) => {
            if (!open) {
              setConfirmAction(null);
              setBulkRejectReason("");
            }
          }}
          onConfirm={() => {
            if (bulkTargetIds.length === 0) {
              toast.info("No matching records to update.");
              setConfirmAction(null);
              setBulkRejectReason("");
              return;
            }
            confirmBulkAction(bulkTargetIds, bulkRejectReason);
            setBulkRejectReason("");
          }}
          title={`Confirm ${confirmAction?.action}`}
          description={`Are you sure you want to ${confirmAction?.action} ${bulkTargetIds.length} ${bulkTargetIds.length === 1 ? "record" : "records"}?`}
          variant={confirmAction?.action === "reject" ? "destructive" : "default"}
        >
          {confirmAction?.action === "reject" && (
            <div className="space-y-2 pt-2">
              <div className="flex flex-wrap gap-1.5">
                {QUICK_REJECTION_REASONS.map((r) => (
                  <Chip
                    key={r}
                    pressed={bulkRejectReason === r}
                    onClick={() => setBulkRejectReason(r)}
                  >
                    {r}
                  </Chip>
                ))}
              </div>
              <Input
                placeholder="Rejection reason"
                aria-label="Rejection reason"
                value={bulkRejectReason}
                onChange={(e) => setBulkRejectReason(e.target.value)}
              />
            </div>
          )}
        </ConfirmDialog>

        <RecordDetailModal
          open={selectedRecord !== null}
          onOpenChange={(open) => !open && setSelectedRecord(null)}
          record={selectedRecord}
          layout="panel"
          siblings={drawerSiblings}
        />
      </div>
    </PageShell>
  );
};

export default TeamManagementPage;
