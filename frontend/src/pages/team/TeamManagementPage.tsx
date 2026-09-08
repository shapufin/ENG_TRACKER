import React, { useState } from "react";
import { useTeamManagement } from "@/hooks/useTeamManagement";
import { AnimatePresence } from "framer-motion";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input } from "@/components/ui/input";
import { LoadingStateWrapper } from "@/components/ui/LoadingStateWrapper";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

import { usePermissions } from "@/context/PermissionContext";
import { Users, Clock, Calendar as CalendarIcon } from "lucide-react";
import type { OvertimeLog, StandbyLog, LeaveRequest } from "@/types";
import { RecordDetailModal } from "@/components/team/RecordDetailModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeamBulkOperationsPanel } from "@/components/team/TeamBulkOperationsPanel";
import { useTeamPageData } from "./hooks/useTeamPageData";
import { useTeamColumns } from "./hooks/useTeamColumns";
import { useTeamBulkActions } from "./hooks/useTeamBulkActions";
import { TeamOverviewCard } from "./components/TeamOverviewCard";
import { TeamFilterBar } from "./components/TeamFilterBar";
import { TeamGroupedTables } from "./components/TeamGroupedTables";
import { handleRejectConfirm } from "./teamManagementHelpers";

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
  const [activeTab, setActiveTab] = useState<"overtime" | "standby" | "leave">("overtime");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved" | "rejected">(
    "all"
  );
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTeam, setFilterTeam] = useState("all");
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [memberGroupMode, setMemberGroupMode] = useState<"none" | "team" | "italian_tl">("none");
  const [selectedRecord, setSelectedRecord] = useState<
    OvertimeLog | StandbyLog | LeaveRequest | null
  >(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectingRecord, setRejectingRecord] = useState<{
    id: number;
    type: "overtime" | "standby" | "leave";
  } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const {
    confirmAction,
    setConfirmAction,
    handleBulkAction,
    confirmBulkAction,
    isApproving,
    isRejecting,
    isDeleting,
  } = useTeamBulkActions(activeTab, () => setSelectedItems(new Set()));

  const {
    membersData,
    userMetaMap,
    availableTeams,
    vacationDaysLeft,
    overtimeHours,
    standbyHours,
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

  const handleReject = (id: number, type: "overtime" | "standby" | "leave") => {
    setRejectingRecord({ id, type });
    setRejectOpen(true);
  };

  const { getOvertimeColumns, getStandbyColumns, getLeaveColumns } = useTeamColumns(
    setSelectedRecord,
    handleReject,
    otApproveMutation,
    otRejectMutation,
    sbApproveMutation,
    sbRejectMutation,
    leaveApproveMutation,
    leaveRejectMutation
  );

  if (!canManageTeam) {
    return (
      <PageShell title="Team Overview">
        <GlassCard className="p-8 text-center">
          <Users className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-xl font-semibold">Access Denied</h2>
          <p className="text-muted-foreground">
            You don&apos;t have permission to access this page.
          </p>
        </GlassCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Team Overview"
      subtitle="Comprehensive team management with filters, bulk operations, and full request history"
    >
      <div className="space-y-6">
        <TeamOverviewCard
          memberCount={membersData.length}
          teamCount={availableTeams.length}
          vacationDaysLeft={vacationDaysLeft}
          overtimeHours={overtimeHours}
          standbyHours={standbyHours}
        />
        <TeamFilterBar
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          filterStatus={filterStatus}
          onFilterStatusChange={setFilterStatus}
          filterTeam={filterTeam}
          onFilterTeamChange={setFilterTeam}
          dateFrom={dateFrom}
          onDateFromChange={setDateFrom}
          dateTo={dateTo}
          onDateToChange={setDateTo}
          memberGroupMode={memberGroupMode}
          onMemberGroupModeChange={setMemberGroupMode}
          availableTeams={availableTeams}
        />

        <AnimatePresence>
          {selectedItems.size > 0 && (
            <TeamBulkOperationsPanel
              selectedCount={selectedItems.size}
              onClear={() => setSelectedItems(new Set())}
              onApprove={() => handleBulkAction("approve", selectedItems.size)}
              onReject={() => handleBulkAction("reject", selectedItems.size)}
              onDelete={() => handleBulkAction("delete", selectedItems.size)}
              canManage={canManageTeam}
              isApproving={isApproving}
              isRejecting={isRejecting}
              isDeleting={isDeleting}
            />
          )}
        </AnimatePresence>

        <Tabs
          value={activeTab}
          onValueChange={(v: string) => {
            setSelectedItems(new Set());
            setActiveTab(v as "overtime" | "standby" | "leave");
          }}
        >
          <TabsList className="grid w-full grid-cols-3 bg-muted/50 p-1">
            <TabsTrigger value="overtime" className="relative flex items-center gap-2">
              <Clock className="h-4 w-4" /> Overtime{" "}
              {activeTab === "overtime" && filteredOvertime.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {filteredOvertime.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="standby" className="relative flex items-center gap-2">
              <Users className="h-4 w-4" /> Standby{" "}
              {activeTab === "standby" && filteredStandby.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {filteredStandby.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="leave" className="relative flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" /> Leave{" "}
              {activeTab === "leave" && filteredLeaves.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {filteredLeaves.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overtime">
            <LoadingStateWrapper isLoading={isLoading}>
              <TeamGroupedTables
                rows={filteredOvertime}
                columnsBuilder={() => getOvertimeColumns}
                emptyCopy="No overtime entries match your filters."
                memberGroupMode={memberGroupMode}
                userMetaMap={userMetaMap}
              />
            </LoadingStateWrapper>
          </TabsContent>
          <TabsContent value="standby">
            <LoadingStateWrapper isLoading={isLoading}>
              <TeamGroupedTables
                rows={filteredStandby}
                columnsBuilder={() => getStandbyColumns}
                emptyCopy="No standby entries match your filters."
                memberGroupMode={memberGroupMode}
                userMetaMap={userMetaMap}
              />
            </LoadingStateWrapper>
          </TabsContent>
          <TabsContent value="leave">
            <LoadingStateWrapper isLoading={isLoading}>
              <TeamGroupedTables
                rows={filteredLeaves}
                columnsBuilder={() => getLeaveColumns}
                emptyCopy="No leave requests match your filters."
                memberGroupMode={memberGroupMode}
                userMetaMap={userMetaMap}
              />
            </LoadingStateWrapper>
          </TabsContent>
        </Tabs>

        <ConfirmDialog
          open={rejectOpen}
          onOpenChange={setRejectOpen}
          title="Reject Entry"
          description="Provide a reason for rejection:"
          onConfirm={() =>
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
            )
          }
          isConfirming={
            otRejectMutation.isPending ||
            sbRejectMutation.isPending ||
            leaveRejectMutation.isPending
          }
          confirmLabel="Reject"
          variant="destructive"
        >
          <div className="pt-2">
            <Input
              placeholder="Rejection reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
        </ConfirmDialog>

        <ConfirmDialog
          open={confirmAction?.open || false}
          onOpenChange={(open) => setConfirmAction(open ? confirmAction : null)}
          onConfirm={() => confirmBulkAction(Array.from(selectedItems))}
          title={`Confirm ${confirmAction?.action}`}
          description={`Are you sure you want to ${confirmAction?.action} ${confirmAction?.count} selected items?`}
        />

        <RecordDetailModal
          open={selectedRecord !== null}
          onOpenChange={(open) => !open && setSelectedRecord(null)}
          record={selectedRecord}
        />
      </div>
    </PageShell>
  );
};

export default TeamManagementPage;
