import React from "react";
import { HoursLogsPage } from "./components/HoursLogsPage";
import { timeRangeColumn } from "./components/standbyColumns";
import { useStandbyLogsPage } from "./hooks/useStandbyLogsPage";
import type { StandbyLog } from "@/types";
import { usePermissions } from "@/context/PermissionContext";

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
    stats,
    approveMutation,
    deleteMutation,
    handleReject,
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
      onApprove={approveMutation.mutate}
      onReject={handleReject}
      onDelete={(id) => deleteMutation.mutate(id)}
      canDelete={isSuperuser}
      extraColumns={[timeRangeColumn]}
      storageKey="table-visibility-standby-logs"
    />
  );
};

export default StandbyLogsPage;
