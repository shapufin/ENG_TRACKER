import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { standbyService } from "@/services/standbyService";
import { handleApiError } from "@/lib/error-handler";
import { useAdminRejectMutation } from "@/hooks/useAdminRejectMutation";
import { toast } from "sonner";
import { useHoursLogsFilterState } from "./hoursLogsFilter";
import { useHoursLogsServerData } from "./useHoursLogsServerData";
import { useHoursLogsBulk } from "./useHoursLogsBulk";
import type { StandbyLog } from "@/types";
import { invalidateAdminDashboard } from "@/lib/adminDashboardKeys";

export const useStandbyLogsPage = () => {
  const qc = useQueryClient();
  const filters = useHoursLogsFilterState();
  const [rejectionDialogOpen, setRejectionDialogOpen] = useState(false);
  const [pendingRejectId, setPendingRejectId] = useState<number | null>(null);
  const {
    filterStatus,
    setFilterStatus,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    searchQuery,
    setSearchQuery,
    page,
    setPage,
  } = filters;
  const {
    logs: filteredLogs,
    total,
    stats,
    isLoading,
    onRowRemoved,
  } = useHoursLogsServerData<StandbyLog>({
    queryKey: ["admin", "standby", "admin_logs"],
    fetchPage: standbyService.getAdminLogs,
    ...filters,
  });

  const bulk = useHoursLogsBulk(standbyService, ["admin", "standby", "admin_logs"]);

  const approveMutation = useMutation({
    mutationFn: (id: number) => standbyService.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "standby", "admin_logs"] });
      void invalidateAdminDashboard(qc);
      onRowRemoved();
      toast.success("Approved");
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const rejectMutation = useAdminRejectMutation(standbyService.reject, {
    invalidateKeys: [["admin", "standby", "admin_logs"]],
    onSuccess: () => onRowRemoved(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => standbyService.deleteLog(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "standby", "admin_logs"] });
      void invalidateAdminDashboard(qc);
      onRowRemoved();
      toast.success("Standby record deleted");
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const handleSingleReject = (id: number) => {
    setPendingRejectId(id);
    setRejectionDialogOpen(true);
  };

  const handleRejectionConfirm = (reason: string) => {
    if (pendingRejectId !== null) rejectMutation.mutate({ id: pendingRejectId, reason });
    setPendingRejectId(null);
  };

  return {
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
  };
};
