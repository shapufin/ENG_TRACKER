import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { standbyService } from "@/services/standbyService";
import { overtimeService } from "@/services/overtimeService";
import { userService } from "@/services/userService";
import { toast } from "sonner";
import { handleApiError } from "@/lib/error-handler";
import { buildCurrentMonthDateParams } from "@/lib/query-date-utils";
import type { CustomDateRange } from "@/pages/hours_logs/components/useHoursLogPageState";
import {
  createCreateHandlers,
  createUpdateHandlers,
  createDeleteHandlers,
  createApprovalHandlers,
  createRejectionHandlers,
} from "./useMutationHandlers";
import type { StandbyLog } from "@/types";

interface UseStandbyQueriesOptions {
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
 * Custom hook for standby-related queries and mutations.
 * Centralizes all standby management logic.
 *
 * Extracted from StandbyPage to reduce complexity.
 */
export const useStandbyQueries = (options: UseStandbyQueriesOptions) => {
  const qc = useQueryClient();

  const dateParams = buildCurrentMonthDateParams(options.customDateRange);

  const rangeKey = options.customDateRange
    ? `${options.customDateRange.from}_${options.customDateRange.to}`
    : "current_month";

  const logsQueryKey = ["standby", options.userId ?? "anonymous", rangeKey];

  const { data, isLoading } = useQuery({
    queryKey: logsQueryKey,
    queryFn: () => standbyService.getLogs(dateParams),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: !!options.userId,
  });

  const logs = options.userId ? data?.results?.filter((l) => l.user === options.userId) || [] : [];

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => userService.getUsers(),
    enabled: options.isAdmin,
  });

  const { data: clients } = useQuery({
    queryKey: ["overtime", "clients"],
    queryFn: () => overtimeService.getClients(),
  });

  const refetchStandbyData = async () => {
    await qc.invalidateQueries({ queryKey: ["standby"], refetchType: "active" });
    await qc.invalidateQueries({ queryKey: ["dashboard"], refetchType: "active" });
    await qc.invalidateQueries({ queryKey: ["team", "standby"], refetchType: "active" });
    await qc.invalidateQueries({ queryKey: ["admin", "standby"], refetchType: "active" });
  };

  const createMutation = useMutation({
    mutationFn: standbyService.createLog,
    ...createCreateHandlers(refetchStandbyData, "Standby", {
      onSuccess: options?.onCreateSuccess,
    }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<StandbyLog> }) =>
      standbyService.updateLog(id, payload),
    ...createUpdateHandlers(refetchStandbyData, "Standby", {
      onSuccess: options?.onUpdateSuccess,
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: standbyService.deleteLog,
    ...createDeleteHandlers(refetchStandbyData, "Standby", {
      onSuccess: options?.onDeleteSuccess,
    }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => standbyService.approve(id),
    ...createApprovalHandlers(refetchStandbyData, {
      onSuccess: options?.onApproveSuccess,
    }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      standbyService.reject(id, reason),
    ...createRejectionHandlers(refetchStandbyData, {
      onSuccess: options?.onRejectSuccess,
    }),
  });

  const createWeeklyMutation = useMutation({
    mutationFn: async (entries: Parameters<typeof standbyService.createLog>[0][]) => {
      const results: { success: boolean; entry: (typeof entries)[0]; error?: string }[] = [];
      for (const entry of entries) {
        try {
          await standbyService.createLog(entry);
          results.push({ success: true, entry });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          results.push({ success: false, entry, error: msg });
        }
      }
      return results;
    },
    onSuccess: async (results) => {
      await refetchStandbyData();
      const successCount = results.filter((r) => r.success).length;
      const failCount = results.length - successCount;
      if (failCount === 0) {
        toast.success(`Created ${successCount} weekly standby entries`);
      } else {
        const failedEntries = results.filter((r) => !r.success);
        toast.error(
          `${failCount} entries failed: ${failedEntries.map((e) => (e.entry as { date?: string }).date).join(", ")}`
        );
      }
    },
    onError: (err: Error) => handleApiError(err),
  });

  return {
    logs,
    users,
    clients,
    isLoading,
    createMutation,
    updateMutation,
    deleteMutation,
    approveMutation,
    rejectMutation,
    createWeeklyMutation,
    refetchStandbyData,
    logsQueryKey,
    dateParams,
  };
};
