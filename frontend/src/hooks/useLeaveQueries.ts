import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { leaveService } from "@/services/leaveService";
import {
  createCreateHandlers,
  createUpdateHandlers,
  createDeleteHandlers,
  createApprovalHandlers,
  createRejectionHandlers,
} from "./useMutationHandlers";

interface UseLeaveQueriesOptions {
  userId: string | number;
  onCreateSuccess?: () => void;
  onUpdateSuccess?: () => void;
  onDeleteSuccess?: () => void;
  onApproveSuccess?: () => void;
  onRejectSuccess?: () => void;
}

/**
 * Custom hook for leave-related queries and mutations.
 * Centralizes all leave management logic.
 *
 * Extracted from LeavePage to reduce complexity.
 */
// fallow-ignore-next-line complexity
export const useLeaveQueries = (options: UseLeaveQueriesOptions) => {
  const qc = useQueryClient();

  const refreshLeaveData = async () => {
    await qc.invalidateQueries({ queryKey: ["vacations"], refetchType: "active" });
    await qc.invalidateQueries({ queryKey: ["dashboard"], refetchType: "active" });
    await qc.invalidateQueries({ queryKey: ["team", "leave"], refetchType: "active" });
    await qc.invalidateQueries({ queryKey: ["admin", "leave"], refetchType: "active" });
    await qc.invalidateQueries({ queryKey: ["vacations", "calendar"], refetchType: "active" });
    await qc.invalidateQueries({ queryKey: ["vacations", "team-balances"], refetchType: "active" });
  };

  const { data, isLoading: requestsLoading } = useQuery({
    queryKey: ["vacations", options.userId, "requests"],
    queryFn: () => leaveService.getRequests({ page_size: 1000, ignore_date_filter: "true" }),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: options.userId !== "anonymous",
  });

  const { data: balances, isLoading: balancesLoading } = useQuery({
    queryKey: ["vacations", options.userId, "balances"],
    queryFn: () => leaveService.getBalances(),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: options.userId !== "anonymous",
  });

  const createMutation = useMutation({
    mutationFn: leaveService.createRequest,
    ...createCreateHandlers(refreshLeaveData, "Request", {
      onSuccess: options?.onCreateSuccess,
    }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      leaveService.updateRequest(id, data),
    ...createUpdateHandlers(refreshLeaveData, "Request", {
      onSuccess: options?.onUpdateSuccess,
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: leaveService.deleteRequest,
    ...createDeleteHandlers(refreshLeaveData, "Request", {
      onSuccess: options?.onDeleteSuccess,
    }),
  });

  const approveMutation = useMutation({
    mutationFn: leaveService.approve,
    ...createApprovalHandlers(refreshLeaveData, {
      onSuccess: options?.onApproveSuccess,
    }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => leaveService.reject(id, reason),
    ...createRejectionHandlers(refreshLeaveData, {
      onSuccess: options?.onRejectSuccess,
    }),
  });

  return {
    requests: data?.results ?? [],
    balances,
    requestsLoading,
    balancesLoading,
    createMutation,
    updateMutation,
    deleteMutation,
    approveMutation,
    rejectMutation,
    refreshLeaveData,
  };
};
