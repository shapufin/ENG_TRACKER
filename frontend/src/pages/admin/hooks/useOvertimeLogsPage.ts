import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { overtimeService } from "@/services/overtimeService";
import { handleApiError } from "@/lib/error-handler";
import { useAdminRejectMutation } from "@/hooks/useAdminRejectMutation";
import { toast } from "sonner";
import { useHoursLogsFilterState, useHoursLogsData } from "./hoursLogsFilter";
import type { OvertimeLog } from "@/types";

export const useOvertimeLogsPage = () => {
  const qc = useQueryClient();
  const {
    filterStatus,
    setFilterStatus,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    searchQuery,
    setSearchQuery,
  } = useHoursLogsFilterState();
  const [rejectionDialogOpen, setRejectionDialogOpen] = useState(false);
  const [pendingRejectId, setPendingRejectId] = useState<number | null>(null);

  const {
    data: logs,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin", "overtime", "admin_logs"],
    queryFn: () => overtimeService.getAdminLogs({ page_size: 500 }),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => overtimeService.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "overtime", "admin_logs"] });
      toast.success("Approved");
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const rejectMutation = useAdminRejectMutation(overtimeService.reject, {
    invalidateKeys: [["admin", "overtime", "admin_logs"]],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => overtimeService.deleteLog(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "overtime", "admin_logs"] });
      toast.success("Overtime record deleted");
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const results = useMemo(
    () => (Array.isArray(logs) ? logs : logs?.results) as OvertimeLog[] | undefined,
    [logs]
  );
  const { filteredLogs, stats } = useHoursLogsData(
    results,
    filterStatus,
    dateFrom,
    dateTo,
    searchQuery
  );

  const handleSingleReject = (id: number) => {
    setPendingRejectId(id);
    setRejectionDialogOpen(true);
  };

  const handleRejectionConfirm = (reason: string) => {
    if (pendingRejectId !== null) rejectMutation.mutate({ id: pendingRejectId, reason });
    setPendingRejectId(null);
  };

  return {
    logs,
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
    stats,
    approveMutation,
    rejectMutation,
    deleteMutation,
    handleSingleReject,
    handleRejectionConfirm,
  };
};
