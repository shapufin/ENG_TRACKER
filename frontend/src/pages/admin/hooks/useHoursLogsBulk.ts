import { useBulkOperations } from "@/hooks/useBulkOperations";
import { handleApiError } from "@/lib/error-handler";
import { invalidateAdminDashboard } from "@/lib/adminDashboardKeys";
import { useQueryClient } from "@tanstack/react-query";

interface BulkService {
  bulkApprove: (ids: number[]) => Promise<{ approved_count: number }>;
  bulkReject: (ids: number[], reason: string) => Promise<{ rejected_count: number }>;
}

/** Bulk approve/reject for an admin hours-log page; resolves true when the call succeeded. */
export const useHoursLogsBulk = (service: BulkService, queryKey: string[]) => {
  const qc = useQueryClient();
  const { bulkApproveMutation, bulkRejectMutation } = useBulkOperations({
    queryKey,
    entityName: "entries",
    approveFn: service.bulkApprove,
    rejectFn: service.bulkReject,
    onSuccess: () => void invalidateAdminDashboard(qc),
  });

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      return true;
    } catch (err) {
      handleApiError(err);
      return false;
    }
  };

  return {
    approve: (ids: number[]) => run(() => bulkApproveMutation.mutateAsync(ids)),
    reject: (ids: number[], reason: string) =>
      run(() => bulkRejectMutation.mutateAsync({ ids, reason })),
    isPending: bulkApproveMutation.isPending || bulkRejectMutation.isPending,
  };
};
