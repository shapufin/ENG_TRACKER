import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { leaveService } from "@/services/leaveService";
import { userService } from "@/services/userService";
import { handleApiError } from "@/lib/error-handler";
import { toast } from "sonner";
import type { LeaveBalance } from "@/types";

interface UseLeaveBalancesOptions {
  onCreateSuccess?: () => void;
  onUpdateSuccess?: () => void;
  onDeleteSuccess?: () => void;
}

/**
 * Custom hook for leave balance queries and mutations.
 * Centralizes all leave balance management logic.
 *
 * Extracted from LeaveBalancesPage to reduce complexity.
 */
export const useLeaveBalances = (options?: UseLeaveBalancesOptions) => {
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "balances"],
    queryFn: () => leaveService.getBalances(),
  });

  const { data: usersData } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => userService.getUsers({ page_size: 1000 }),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const balances = (data as any)?.results ?? data ?? [];
  const users = usersData?.results ?? [];

  const createMutation = useMutation({
    mutationFn: leaveService.createBalance,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "balances"] });
      toast.success("Balance created");
      options?.onCreateSuccess?.();
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<LeaveBalance> }) =>
      leaveService.updateBalance(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "balances"] });
      toast.success("Updated");
      options?.onUpdateSuccess?.();
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const deleteMutation = useMutation({
    mutationFn: leaveService.deleteBalance,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "balances"] });
      toast.success("Balance deleted");
      options?.onDeleteSuccess?.();
    },
    onError: (err: unknown) => handleApiError(err),
  });

  return {
    balances,
    users,
    isLoading,
    isError,
    createMutation,
    updateMutation,
    deleteMutation,
  };
};
