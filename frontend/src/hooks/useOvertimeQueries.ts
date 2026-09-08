import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { overtimeService } from "@/services/overtimeService";
import { userService } from "@/services/userService";
import { buildCurrentMonthDateParams } from "@/lib/query-date-utils";
import type { CustomDateRange } from "@/pages/hours_logs/components/useHoursLogPageState";

import {
  createCreateHandlers,
  createUpdateHandlers,
  createDeleteHandlers,
  createApprovalHandlers,
  createRejectionHandlers,
} from "./useMutationHandlers";
import type { OvertimeLog } from "@/types";

interface UseOvertimeQueriesOptions {
  userId?: number;
  customDateRange?: CustomDateRange | null;
  isAdmin?: boolean;
  onCreateSuccess?: () => void;
  onUpdateSuccess?: () => void;
  onDeleteSuccess?: () => void;
  onApproveSuccess?: () => void;
  onRejectSuccess?: () => void;
}

/**
 * Custom hook for overtime-related queries and mutations.
 * Centralizes all overtime management logic.
 *
 * Extracted from OvertimePage to reduce complexity.
 */
export const useOvertimeQueries = (options: UseOvertimeQueriesOptions) => {
  const qc = useQueryClient();

  const dateParams = buildCurrentMonthDateParams(options.customDateRange);

  const rangeKey = options.customDateRange
    ? `${options.customDateRange.from}_${options.customDateRange.to}`
    : "current_month";

  const logsQueryKey = [
    "overtime",
    options.userId ?? "anonymous",
    rangeKey,
  ];
  const summaryQueryKey = ["overtime", options.userId ?? "anonymous", "summary"];

  const { data, isLoading } = useQuery({
    queryKey: logsQueryKey,
    queryFn: () => overtimeService.getLogs(dateParams),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: !!options.userId,
  });

  const myLogs = options.userId
    ? data?.results?.filter((l) => l.user === options.userId) || []
    : [];

  const { data: summary } = useQuery({
    queryKey: summaryQueryKey,
    queryFn: () => overtimeService.getSummary(),
    enabled: !!options.userId,
  });

  const { data: clients } = useQuery({
    queryKey: ["overtime", "clients"],
    queryFn: () => overtimeService.getClients(),
  });

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => userService.getUsers(),
    enabled: options.isAdmin,
  });

  const refetchOvertimeData = async () => {
    await qc.invalidateQueries({ queryKey: ["overtime"], refetchType: "active" });
    await qc.invalidateQueries({ queryKey: ["dashboard"], refetchType: "active" });
    await qc.invalidateQueries({ queryKey: ["team", "overtime"], refetchType: "active" });
    await qc.invalidateQueries({ queryKey: ["admin", "overtime"], refetchType: "active" });
  };

  const createMutation = useMutation({
    mutationFn: overtimeService.createLog,
    ...createCreateHandlers(refetchOvertimeData, "Overtime", {
      onSuccess: options?.onCreateSuccess,
    }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<OvertimeLog> }) =>
      overtimeService.updateLog(id, payload),
    ...createUpdateHandlers(refetchOvertimeData, "Overtime", {
      onSuccess: options?.onUpdateSuccess,
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: overtimeService.deleteLog,
    ...createDeleteHandlers(refetchOvertimeData, "Overtime", {
      onSuccess: options?.onDeleteSuccess,
    }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => overtimeService.approve(id),
    ...createApprovalHandlers(refetchOvertimeData, {
      onSuccess: options?.onApproveSuccess,
    }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      overtimeService.reject(id, reason),
    ...createRejectionHandlers(refetchOvertimeData, {
      onSuccess: options?.onRejectSuccess,
    }),
  });

  return {
    logs: myLogs,
    summary,
    clients,
    users,
    isLoading,
    createMutation,
    updateMutation,
    deleteMutation,
    approveMutation,
    rejectMutation,
    refetchOvertimeData,
    logsQueryKey,
    summaryQueryKey,
    dateParams,
  };
};
