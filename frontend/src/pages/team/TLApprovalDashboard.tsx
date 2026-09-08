import React from "react";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { usePermissions } from "@/context/PermissionContext";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { RecordDetailModal } from "@/components/team/RecordDetailModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TLApprovalStats } from "@/components/team/TLApprovalStats";
import { useTLApprovalColumns } from "./hooks/useTLApprovalColumns";
import { useTLApprovalDashboard } from "./hooks/useTLApprovalDashboard";
import { TLApprovalDateFilters } from "./components/TLApprovalDateFilters";
import { TLApprovalTabs } from "./components/TLApprovalTabs";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { formatMonthLabel } from "@/lib/monthOptions";

// fallow-ignore-next-line complexity
export const TLApprovalDashboard: React.FC = () => {
  const { canManageTeam } = usePermissions();
  const {
    activeTab,
    setActiveTab,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    rowSelection,
    selectedRecord,
    setSelectedRecord,
    rejectOpen,
    rejectReason,
    setRejectReason,
    queries,
    rejectMutation,
    bulkApproveMutation,
    bulkRejectMutation,
    getSelectedIds,
    clearSelection,
    handleRowSelectionChange,
    handleApprove,
    handleReject,
    handleBulkApprove,
    handleBulkReject,
    confirmReject,
    closeRejectDialog,
    pendingMonths,
    handleCardClick,
    handleMonthSelect,
    periodStatus,
    periodStatusLoading,
    finalizeOpen,
    setFinalizeOpen,
    finalizePeriod,
    finalizePending,
  } = useTLApprovalDashboard(canManageTeam);

  const { overtimeColumns, standbyColumns, leaveColumns } = useTLApprovalColumns({
    onView: setSelectedRecord,
    onApprove: handleApprove,
    onReject: handleReject,
  });

  // Derived: which month is currently selected (from dateFrom) and is it past?
  const selectedMonthLabel = dateFrom ? formatMonthLabel(dateFrom) : "";
  const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const selectedMonthKey = dateFrom ? dateFrom.slice(0, 7) : "";
  const isPastMonth = selectedMonthKey < currentMonthKey;
  const isFinalized = periodStatus?.status === "finalized";

  if (!canManageTeam) {
    return (
      <PageShell title="Pending Approvals">
        <GlassCard className="p-8 text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">You do not have permission to access this page.</p>
        </GlassCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Pending Approvals"
      subtitle="Quick review and approval of overtime, standby, and leave requests awaiting your decision"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <MonthPicker
            value={dateFrom}
            onMonthChange={handleMonthSelect}
            aria-label="Filter by month"
            placeholder="Jump to month"
          />
          <Button
            variant="outline"
            disabled={periodStatusLoading || isFinalized}
            onClick={() => setFinalizeOpen(true)}
          >
            {isFinalized ? "Period Finalized" : `Finalize ${selectedMonthLabel}`}
          </Button>
        </div>
      }
    >
      {isFinalized && periodStatus.close && (
        <GlassCard className="mb-4 border-warning/40 bg-warning/5 p-4">
          <p className="text-sm font-medium">
            The {selectedMonthLabel} approval period is finalized.
          </p>
          <p className="text-sm text-muted-foreground">
            Entries submitted after {new Date(periodStatus.close.closed_at).toLocaleString()} will
            be processed in the next payroll period.
          </p>
        </GlassCard>
      )}

      <TLApprovalStats
        overtimeCount={
          pendingMonths.overtime.length > 0
            ? pendingMonths.overtime.reduce((sum, m) => sum + m.count, 0)
            : queries.overtime.data?.length || 0
        }
        standbyCount={
          pendingMonths.standby.length > 0
            ? pendingMonths.standby.reduce((sum, m) => sum + m.count, 0)
            : queries.standby.data?.length || 0
        }
        leaveCount={
          pendingMonths.leave.length > 0
            ? pendingMonths.leave.reduce((sum, m) => sum + m.count, 0)
            : queries.leave.data?.length || 0
        }
        isLoading={{
          overtime: queries.overtime.isLoading,
          standby: queries.standby.isLoading,
          leave: queries.leave.isLoading,
        }}
        pendingMonths={pendingMonths}
        onCardClick={handleCardClick}
      />

      <TLApprovalDateFilters
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
      />

      <TLApprovalTabs
        activeTab={activeTab}
        onActiveTabChange={setActiveTab}
        queries={queries}
        columns={{ overtime: overtimeColumns, standby: standbyColumns, leave: leaveColumns }}
        rowSelection={rowSelection}
        onRowSelectionChange={handleRowSelectionChange}
        onBulkApprove={handleBulkApprove}
        onBulkReject={handleBulkReject}
        onClearSelection={clearSelection}
        getSelectedIds={getSelectedIds}
        isBulkPending={bulkApproveMutation.isPending || bulkRejectMutation.isPending}
      />

      <RecordDetailModal
        open={selectedRecord !== null}
        onOpenChange={(open) => !open && setSelectedRecord(null)}
        record={selectedRecord}
      />

      <ConfirmDialog
        open={finalizeOpen}
        onOpenChange={setFinalizeOpen}
        title={`Finalize ${selectedMonthLabel} approval period`}
        onConfirm={finalizePeriod}
        isConfirming={finalizePending}
        confirmLabel={`Finalize ${selectedMonthLabel}`}
      >
        <div className="space-y-3 pt-2">
          <p className="text-sm text-muted-foreground">
            New overtime and standby entries submitted after this moment with work dates in{" "}
            <strong>{selectedMonthLabel}</strong> will be processed in the next payroll period.
            Existing work dates will not change.
          </p>
          {isPastMonth && (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p className="text-sm text-warning">
                <strong>This is a past month.</strong> Only finalize if you want late-submitted
                entries with work dates in {selectedMonthLabel} to carry over to the next processing
                period. This action is irreversible.
              </p>
            </div>
          )}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={closeRejectDialog}
        title="Reject Request"
        description="Provide a reason for rejection:"
        onConfirm={confirmReject}
        isConfirming={rejectMutation.isPending || bulkRejectMutation.isPending}
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
    </PageShell>
  );
};

export default TLApprovalDashboard;
