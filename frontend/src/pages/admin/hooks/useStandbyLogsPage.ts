import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { standbyService } from "@/services/standbyService";
import { handleApiError } from "@/lib/error-handler";
import { useAdminRejectMutation } from "@/hooks/useAdminRejectMutation";
import { toast } from "sonner";
import { useHoursLogsFilterState, useHoursLogsData } from "./hoursLogsFilter";
import type { StandbyLog } from "@/types";

export const useStandbyLogsPage = () => {
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

  const { data: logs, isLoading } = useQuery({
    queryKey: ["admin", "standby", "admin_logs"],
    queryFn: () => standbyService.getAdminLogs({ page_size: 500 }),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => standbyService.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "standby", "admin_logs"] });
      toast.success("Approved");
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const rejectMutation = useAdminRejectMutation(standbyService.reject, {
    invalidateKeys: [["admin", "standby", "admin_logs"]],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => standbyService.deleteLog(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "standby", "admin_logs"] });
      toast.success("Standby record deleted");
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const results = useMemo(() => logs?.results as StandbyLog[] | undefined, [logs]);
  const { filteredLogs, stats } = useHoursLogsData(
    results,
    filterStatus,
    dateFrom,
    dateTo,
    searchQuery
  );

  const handleReject = (id: number) => {
    const reason = prompt("Enter rejection reason:") || "";
    if (reason) rejectMutation.mutate({ id, reason });
  };

  return {
    logs,
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
  };
};
