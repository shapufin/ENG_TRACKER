import React from "react";
import { HoursLogsPage } from "./components/HoursLogsPage";
import { RejectionReasonDialog } from "./components/RejectionReasonDialog";
import { timeRangeColumn } from "./components/standbyColumns";
import { useStandbyLogsPage } from "./hooks/useStandbyLogsPage";
import type { StandbyLog } from "@/types";
import { usePermissions } from "@/context/PermissionContext";
import { standbyService } from "@/services/standbyService";
import { handleApiError } from "@/lib/error-handler";
import { buildHoursExportParams } from "./hooks/hoursLogsExport";

export const StandbyLogsPage: React.FC = () => {
  const {
    isLoading,
    filterStatus,
    setFilterStatus,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    searchQuery,
    setSearchQuery,
    filteredLogs,
    total,
    page,
    setPage,
    stats,
    bulk,
    approveMutation,
    deleteMutation,
    rejectionDialogOpen,
    setRejectionDialogOpen,
    handleSingleReject,
    handleRejectionConfirm,
  } = useStandbyLogsPage();
  const { isSuperuser } = usePermissions();

  return (
    <HoursLogsPage<StandbyLog>
      title="Standby Logs"
      subtitle="Manage and review employee standby submissions."
      isLoading={isLoading}
      filterStatus={filterStatus}
      setFilterStatus={setFilterStatus}
      dateFrom={dateFrom}
      setDateFrom={setDateFrom}
      dateTo={dateTo}
      setDateTo={setDateTo}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      stats={stats}
      filteredLogs={filteredLogs}
      total={total}
      page={page}
      onPageChange={setPage}
      onApprove={approveMutation.mutate}
      onReject={handleSingleReject}
      onDelete={(id) => deleteMutation.mutate(id)}
      canDelete={isSuperuser}
      extraColumns={[timeRangeColumn]}
      onExport={() =>
        standbyService
          .exportCsv(buildHoursExportParams(filterStatus, dateFrom, dateTo, searchQuery))
          .catch((err: unknown) => {
            handleApiError(err);
          })
      }
      bulk={bulk}
      storageKey="table-visibility-standby-logs"
    >
      <RejectionReasonDialog
        open={rejectionDialogOpen}
        onOpenChange={setRejectionDialogOpen}
        onConfirm={handleRejectionConfirm}
      />
    </HoursLogsPage>
  );
};

export default StandbyLogsPage;
