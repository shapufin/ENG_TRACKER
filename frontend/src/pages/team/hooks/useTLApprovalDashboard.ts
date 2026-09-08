import { useState, useMemo, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RowSelectionState } from "@tanstack/react-table";
import { useApprovalMutations } from "@/hooks/useApprovalMutations";
import { useTeamPendingQueries } from "@/hooks/useTeamPendingQueries";
import { usePendingMonths } from "@/hooks/usePendingMonths";
import { useTLBulkMutations } from "./useTLBulkMutations";
import { useInvalidateVacationData } from "@/hooks/useInvalidateVacationData";
import { userService } from "@/services/userService";
import { toast } from "sonner";
import { getNextPendingMonth, getMonthRange, toMonthKey } from "./pendingMonthNavigation";
import { toLocalISODate } from "@/lib/date-format-utils";
import type { OvertimeLog, StandbyLog, LeaveRequest } from "@/types";
import type { PendingStatType } from "@/components/team/TLApprovalStats";

export type Tab = "overtime" | "standby" | "leave";

export const useTLApprovalDashboard = (canManageTeam: boolean) => {
  const [activeTab, setActiveTab] = useState<Tab>("overtime");
  const initialDateRange = useMemo(() => {
    const now = new Date();
    const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const lastDay = toLocalISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    return { firstDay, lastDay };
  }, []);

  const [dateFrom, setDateFrom] = useState(initialDateRange.firstDay);
  const [dateTo, setDateTo] = useState(initialDateRange.lastDay);
  const [rowSelection, setRowSelection] = useState<Record<Tab, RowSelectionState>>({
    overtime: {},
    standby: {},
    leave: {},
  });
  const [selectedRecord, setSelectedRecord] = useState<
    OvertimeLog | StandbyLog | LeaveRequest | null
  >(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectingRecord, setRejectingRecord] = useState<{ id: number; type: Tab } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [finalizeOpen, setFinalizeOpen] = useState(false);

  const invalidateVacationData = useInvalidateVacationData();
  const queryClient = useQueryClient();

  const periodStatus = useQuery({
    queryKey: ["approval-period", dateFrom],
    queryFn: () => userService.getApprovalPeriodStatus(dateFrom),
    enabled: canManageTeam,
  });

  const finalizeMutation = useMutation({
    mutationFn: () => userService.finalizeApprovalPeriod(dateFrom),
    onSuccess: (result) => {
      setFinalizeOpen(false);
      toast.success(
        `Period finalized. New entries will be processed in ${result.requested_processing_period}.`
      );
      queryClient.invalidateQueries({ queryKey: ["approval-period"] });
      queryClient.invalidateQueries({ queryKey: ["team", "overtime"] });
      queryClient.invalidateQueries({ queryKey: ["team", "standby"] });
      queryClient.invalidateQueries({ queryKey: ["pending-months"] });
    },
    onError: () => toast.error("Could not finalize this approval period."),
  });

  const queries = useTeamPendingQueries({ dateFrom, dateTo, canManageTeam });
  const pendingMonths = usePendingMonths({ canManageTeam });

  const refetchMap = {
    overtime: queries.overtime.refetch,
    standby: queries.standby.refetch,
    leave: queries.leave.refetch,
  };

  const { approveMutation, rejectMutation } = useApprovalMutations({
    invalidateVacationData,
    refetchMap,
  });

  const { bulkApproveMutation, bulkRejectMutation } = useTLBulkMutations({
    dateFrom,
    dateTo,
    invalidateVacationData,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getSelectedIds = (type: Tab, data: any[]) => {
    const selection = rowSelection[type];
    return Object.keys(selection)
      .filter((key) => selection[key])
      .map((idx) => data[parseInt(idx)]?.id)
      .filter(Boolean);
  };

  const clearSelection = (type: Tab) => {
    setRowSelection((prev) => ({ ...prev, [type]: {} }));
  };

  const handleRowSelectionChange =
    (type: Tab) =>
    (updaterOrValue: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)) => {
      setRowSelection((prev) => ({
        ...prev,
        [type]:
          typeof updaterOrValue === "function"
            ? (updaterOrValue as (old: RowSelectionState) => RowSelectionState)(prev[type])
            : updaterOrValue,
      }));
    };

  const handleApprove = (type: Tab, id: number) => {
    approveMutation.mutate({ type, id });
  };

  const handleReject = (id: number, type: Tab) => {
    setRejectingRecord({ id, type });
    setRejectOpen(true);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleBulkApprove = (type: Tab, data: any[]) => {
    const ids = getSelectedIds(type, data);
    if (ids.length === 0) return;
    bulkApproveMutation.mutate({ type, ids });
    clearSelection(type);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleBulkReject = (type: Tab, data: any[]) => {
    const ids = getSelectedIds(type, data);
    if (ids.length === 0) return;
    setRejectingRecord({ id: 0, type });
    setRejectOpen(true);
  };

  // fallow-ignore-next-line complexity
  const confirmReject = () => {
    if (!rejectingRecord) return;
    const { id, type } = rejectingRecord;
    if (id === 0) {
      const data =
        type === "overtime"
          ? queries.overtime.data
          : type === "standby"
            ? queries.standby.data
            : queries.leave.data;
      const ids = getSelectedIds(type, data || []);
      if (ids.length > 0) bulkRejectMutation.mutate({ type, ids, reason: rejectReason });
    } else {
      rejectMutation.mutate({ type, id, reason: rejectReason });
    }
    setRejectReason("");
    setRejectOpen(false);
    setRejectingRecord(null);
  };

  const closeRejectDialog = (open: boolean) => {
    setRejectOpen(open);
    if (!open) setRejectingRecord(null);
  };

  /**
   * Called when a pending count card is clicked. Jumps to the next month
   * that has pending items for that type, cycling back to the first month
   * if the current month is at or past the last pending month.
   * Also switches the active tab to the clicked type.
   */
  const handleCardClick = useCallback(
    (type: PendingStatType) => {
      const months = pendingMonths[type];
      const currentMonth = toMonthKey(dateFrom);
      const nextMonth = getNextPendingMonth(months, currentMonth);
      if (!nextMonth) return;
      const { firstDay, lastDay } = getMonthRange(nextMonth);
      setDateFrom(firstDay);
      setDateTo(lastDay);
      setActiveTab(type);
    },
    [pendingMonths, dateFrom]
  );

  /**
   * Jump to a selected month (from the MonthPicker in the page header).
   * Sets both dateFrom (first day) and dateTo (last day) so the existing
   * custom-range filters are overridden. Selecting a custom date range
   * afterwards simply overwrites these values again.
   */
  const handleMonthSelect = useCallback(
    (monthIso: string) => {
      const { firstDay, lastDay } = getMonthRange(monthIso);
      setDateFrom(firstDay);
      setDateTo(lastDay);
    },
    []
  );

  return {
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
    rejectingRecord,
    rejectReason,
    setRejectReason,
    queries,
    pendingMonths,
    periodStatus: periodStatus.data,
    periodStatusLoading: periodStatus.isLoading,
    finalizeOpen,
    setFinalizeOpen,
    finalizePeriod: () => finalizeMutation.mutate(),
    finalizePending: finalizeMutation.isPending,
    approveMutation,
    rejectMutation,
    bulkApproveMutation,
    bulkRejectMutation,
    invalidateVacationData,
    getSelectedIds,
    clearSelection,
    handleRowSelectionChange,
    handleApprove,
    handleReject,
    handleBulkApprove,
    handleBulkReject,
    confirmReject,
    closeRejectDialog,
    handleCardClick,
    handleMonthSelect,
  };
};
