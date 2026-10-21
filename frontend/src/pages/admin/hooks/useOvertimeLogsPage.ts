import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { overtimeService } from "@/services/overtimeService";
import { handleApiError } from "@/lib/error-handler";
import { useAdminRejectMutation } from "@/hooks/useAdminRejectMutation";
import { toast } from "sonner";
import { useHoursLogsFilterState } from "./hoursLogsFilter";
import { useHoursLogsServerData } from "./useHoursLogsServerData";
import type { OvertimeLog } from "@/types";
import { invalidateAdminDashboard } from "@/lib/adminDashboardKeys";

export const useOvertimeLogsPage = () => {
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
    error,
    onRowRemoved,
  } = useHoursLogsServerData<OvertimeLog>({
    queryKey: ["admin", "overtime", "admin_logs"],
    fetchPage: overtimeService.getAdminLogs,
    ...filters,
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => overtimeService.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "overtime", "admin_logs"] });
      void invalidateAdminDashboard(qc);
      onRowRemoved();
      toast.success("Approved");
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const rejectMutation = useAdminRejectMutation(overtimeService.reject, {
    invalidateKeys: [["admin", "overtime", "admin_logs"]],
    onSuccess: () => onRowRemoved(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => overtimeService.deleteLog(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "overtime", "admin_logs"] });
      void invalidateAdminDashboard(qc);
      onRowRemoved();
      toast.success("Overtime record deleted");
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
    pendingRejectId,
    filteredLogs,
    total,
    page,
    setPage,
    stats,
    approveMutation,
    rejectMutation,
    deleteMutation,
    handleSingleReject,
    handleRejectionConfirm,
  };
};
