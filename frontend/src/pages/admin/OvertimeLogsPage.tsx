import React from "react";
import { HoursLogsPage } from "./components/HoursLogsPage";
import { RejectionReasonDialog } from "./components/RejectionReasonDialog";
import { useOvertimeLogsPage } from "./hooks/useOvertimeLogsPage";
import type { OvertimeLog } from "@/types";
import { usePermissions } from "@/context/PermissionContext";
import { overtimeService } from "@/services/overtimeService";
import { handleApiError } from "@/lib/error-handler";
import { buildHoursExportParams } from "./hooks/hoursLogsExport";

export const OvertimeLogsPage: React.FC = () => {
  const {
    isLoading,
    error,
    filterStatus,
    setFilterStatus,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    searchQuery,
    setSearchQuery,
    rejectionDialogOpen,
    setRejectionDialogOpen,
    filteredLogs,
    stats,
    approveMutation,
    deleteMutation,
    handleSingleReject,
    handleRejectionConfirm,
  } = useOvertimeLogsPage();
  const { isSuperuser } = usePermissions();

  return (
    <HoursLogsPage<OvertimeLog>
      title="Overtime Logs"
      subtitle="Manage and review employee overtime submissions."
      isLoading={isLoading}
      error={error}
      errorMessage="Error loading overtime logs"
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
      onApprove={approveMutation.mutate}
      onReject={handleSingleReject}
      onDelete={(id) => deleteMutation.mutate(id)}
      canDelete={isSuperuser}
      onExport={() =>
        overtimeService
          .exportCsv(buildHoursExportParams(filterStatus, dateFrom, dateTo))
          .catch((err: unknown) => {
            handleApiError(err);
          })
      }
      storageKey="table-visibility-overtime-logs"
    >
      <RejectionReasonDialog
        open={rejectionDialogOpen}
        onOpenChange={setRejectionDialogOpen}
        onConfirm={handleRejectionConfirm}
      />
    </HoursLogsPage>
  );
};

export default OvertimeLogsPage;
